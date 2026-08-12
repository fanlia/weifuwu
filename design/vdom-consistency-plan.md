# vdom 一致性 & 可预测性优化计划（占位法·修订版）

> 状态：**已实施闭环（2026-12，commit 4d941320）**· 来源：提交按钮消失事故（2026-12，AGENTS.md §6.3）+ 引擎代码审查
> **用户决策（2026-12，本修订版核心）**：vnode 层对用户输入**完全透明**——renderFn 返回的
> children 数组（含 `{cond && <X/>}` 的 false 占位）原样参与 diff，**禁止 filter/转换等 magic**；
> 无渲染值（false/null/undefined/true）的对齐问题在 **render 阶段（vnode → DOM）用占位节点解决**。
> 目标：① **vdom 与 DOM 全程一致**——DOM 被构造成 children 数组的同构镜像（数组第 i 项 ⟷
> childNodes 第 i 个节点），错位从结构上不可能发生；② **运行时可预测**——同一状态 → 同一 DOM，
> 错误可定位、可复现、可回放。**全部阶段已实施**（0/A/B/K/C/D/E + A-3 SSR 同步），
> 验收：1794 测试全绿 + agent-browser 实测（Form 按钮保留、data-wf-key/id/占位 DOM 可见）
> 前提约束（实施时遵守）：render-only 心智不变；V3-1~V3-3 性能优化全部保留（零拷贝、引用短路、nodeValue
> 直改）；不做架构重构（fiber/调度器/并发）；**children/属性转化规则必须单一实现（单一规则源）**
> ——任何转化形态（占位/数组项=Fragment/非法输入分类/属性三通道/enumerated）的判定收敛到共享
> 模块，全部消费方调用它，**禁止各路径各自实现形态判定**（同一语义多套实现 = 漂移 = 转化分叉，
> 是确保透明的重要一步）。

---

## 0. 背景与修订动机

### 0.1 事故因果链（不变，AGENTS.md §6.3 已记录）

```
JSX {cond && <Alert/>} = false
  → V3-3b normalizeChildren 零拷贝返回（false 保留在 children 数组）
  → renderValue 不产生 DOM（boolean → null → skip）→ DOM 比数组"少"节点
  → patchChildren 建 oldNodes：false 位置取 source[i] = childNodes[i] = 下一个真实兄弟（按钮）
  → 删除分支 removeChild(按钮) → 两树永久错位 → 静默传播
```

### 0.2 修订动机：上一版方案的 filter 违背透明性

上一版（filter 方案）在 `patchChildren` 入口 `normalizeChildren(...).filter(c => c != null ...)`
——**这是对用户 vnode 的 magic**：删掉了用户 renderFn 返回数组里的元素。问题：

- 用户写 `[Field, false, Button]`，diff 却按 `[Field, Button]` 处理——**diff 看到的不是用户写的树**
- 过滤责任在消费侧（normalizeChildren 的语义与消费侧不一致，防御分散、易漏）
- filter 产生新数组破坏 V3-3b 引用恒等短路（`oldInput === newInput` 零操作 / `newC === oldC` 剪枝）
- 治标：把"空洞错位"这个症状修掉了，没解决"两树不同构"这个根因

**用户决策的方向**：根因是「数组有项、DOM 无节点」的**结构不对称**。与其在 vnode 侧删掉数组项
（magic），不如在 **DOM 侧补齐**——render 时为无渲染值建占位节点，让 DOM 与数组同构。
对称性从"消费侧自觉维护"变成"构建时结构保证"。

---

## 1. 问题清单（修订版）

| # | 问题 | 处置 |
|---|------|------|
| C-1 | **两树不同构**：数组有 false/null 项而 DOM 无节点 → 下标猜测错位 | 占位法治本（阶段 A） |
| C-2 | fragment 多节点展开后，后续 string 的 `source[i]` 错位（本次事故同类未爆变体） | 阶段 B（诚实裁剪或锚点补充） |
| C-3 | 无树同构校验，错位静默传播 | 阶段 C（dev audit） |
| C-4 | 不变量只在文档，无代码断言 | 阶段 C（invariant） |
| C-5 | 错误无组件路径上下文，多层级定位慢 | 阶段 C（_parentVNode 链） |
| C-6 | 确定性（同一状态→同一 DOM）无测试保障 | 阶段 D |

---

## 2. 方案

### 阶段 0 — 单一规则源：children 转化模块（架构约束，先于 A/B 实施）【已实施：transform.ts】

**背景**：同一 JSX 当前有四套 children 转化实现——`buildVNode`（数组递归）/ `renderValue`
（native 循环）/ `patchChildren`（source 映射）/ `renderSsr`（`return ''` 跳过空洞）/ `hydrateVNode`
（`.flat(Infinity)`）——任何一处漂移 → 同一写法在不同路径行为不同（转化分叉不依赖结构不一致）。
已知漂移证据：① SSR 对空洞 `return ''` vs 客户端建占位 → hydration mismatch；② build 把任意
Symbol 当 native 递归（L197）vs render 无 symbol 分支 → build/render 判定分歧。

**`children-transform.ts`（`src/ui-dom/vdom/`，单一规则源）**：收敛全部 children 形态判定——

```
classify(item):                 // 每项唯一分类：占位值 / 数组项(隐式Fragment) / Fragment节点 /
                               // 组件 / 原生元素 / 文本 / 非法输入（含分类详情，诊断占位用）
placeholderOf(item): string    // 占位内容（wf-hole: false / object 摘要 / bad-vnode type=…）
normalize(children): VNodeChild[]  // 零拷贝返回（不展开、不过滤——数组项保留原样）
```

五个消费方（buildVNode / renderValue / patchChildren / renderSsr / hydrateVNode）全部调用
`classify`/`placeholderOf`/`normalize`——**禁止各自实现 children 形态判定**；新增 children
形态只改这一个模块。audit（阶段 C）校验五路径输出结构一致（SSR 序列化 vs 客户端首帧——
§3.5 mismatch 纪律从文档红线升级为运行时校验）。

**验收**：grep 审计「`Array.isArray` / `typeof === 'boolean'` / `type === Fragment`」在五消费方
中的出现次数收敛到 `children-transform.ts` 单一实现（消费方只调函数不写判定）；SSR 输出与
客户端首帧结构对比测试全绿；build/render 判定分歧测试（symbol 等）修复后唯一。

### 阶段 A — 占位法：render 建占位，vnode 零 magic（C-1 治本）【已实施】

**核心不变量**：渲染后 `parent.childNodes.length === normalizeChildren(children).length`（fragment
展开除外，见阶段 B）——**数组每个位置恰占一个 DOM 槽位**。

#### A-1 renderValue：无渲染值 → 占位节点（`src/ui-dom/vdom/render.ts`）

数组子项渲染循环中，`false/null/undefined/true` 不再 `return null`（跳过），改为创建占位节点。
**占位节点 = 注释节点，带诊断内容**（用户决策 2026-12）：

```
<!--wf-hole: false-->              合法无渲染值：显示值本身（条件渲染当前 false）
<!--wf-hole: null--> / <!--wf-hole: undefined--> / <!--wf-hole: true-->
<!--wf-hole: object {"foo":"bar"}-->   非法对象：JSON 摘要（截断 80 字符）
<!--wf-hole: object [object Object]-->  循环引用/不可序列化：构造函数名兜底
<!--wf-hole: bad-vnode type=number(123)-->  非法 type
<!--wf-hole: bad-vnode type=Symbol(custom)--> 未知 Symbol（区别于 Fragment/Portal）
```

**宽容策略（用户决策——对齐 §6.4 事件 prop 守卫 warn+跳过先例）**：非法输入（普通对象/
数字 type/未知 Symbol）也**占位而非抛错**——渲染管线韧性，一次非法输入不崩整个页面；但
**不是静默**：占位 + `console.warn`（按组件路径+位置幂等一次）。dev 可用 `__WF_VDOM_STRICT`
开关升级为 throw（诚实裁剪的严格模式）。占位内容序列化安全：comment 内不能含 `--`（HTML5
规范）——摘要替换 `--` 或截断；合法占位（`wf-hole: false`）与非法占位（`wf-hole: object …`）
**内容可区分**——audit/调试能判断「正常条件渲染」vs「传错东西」。

**顶层（非数组）无占位**：组件输出 null / 单项为 false 时仍 `return null`——占位只存在于
**数组上下文**（数组是唯一"多子项有序容器"，对齐只在数组内才有意义）。

**children 契约（用户决策 2026-12：数组项 ≡ 隐式 Fragment）**：children 数组允许的项类型 =
**数组项等价于 Fragment 节点**（分组语义）——`[xx, [yy, zz], aa]` 的 `[yy, zz]` ≡ `Fragment(yy, zz)`。
其余项：组件 vnode / 原生元素 / Fragment 节点 / 文本 / 占位值 false|null / 非法输入（诊断占位）。

**实现（vnode 层透明 + 消费侧 Fragment 语义）**：**不把数组项真的替换成 Fragment vnode**
（build 新建归一化数组会破坏 `oldInput === newInput` 引用恒等短路）；`vnode._child` 保留用户
数组原样，renderValue / patchChildren 遇数组项**按 Fragment 语义处理**（展开 + 范围锚点，与
Fragment 节点同一机制）——见阶段 B 的 `_childAnchors`（从可选升级为必选）。

**删除全部嵌套展开实现**：normalizeChildren 栈展开 / hydration `.flat(Infinity)` / renderValue
数组递归——不再需要（数组项按 Fragment 语义走范围锚点，而非扁平化）；`normalizeChildren`
只保留零拷贝返回（引用恒等短路对所有数组生效，行为分叉消失）。

#### A-2 patchChildren：对称占位处理（`src/ui-dom/vdom/diff.ts`）

```
数组内配对（i 位置）：
  占位 ↔ 占位   → 内容同则 skip；内容变（false→object）→ nodeValue 直改注释内容（V3-1 同款）
  占位 → 真实   → replaceChild(占位, 新节点)         ← 替代原"新增 insertBefore 搜锚点"（简化！）
  真实 → 占位   → replaceChild(节点, 占位)            ← 替代原"删除 removeChild"（不塌缩！）
  真实 ↔ 真实   → patchValue（现状不变）
```

关键：**「真实 → 占位」必须 replaceChild 而非 removeChild**——childNodes 长度恒定，函数入口
预捕获的 `source`（`Array.from(parent.childNodes)`）在遍历期间**全部索引持续有效**（这是占位
方案简化 diff 的根本原因：不再需要"删除后重新定位"）。

- **删除 filter**：`normalizeChildren` 恢复完全零拷贝（仅保留既有嵌套数组展开——不 mutate
  原数组，渲染语义内扁平化，非 magic）；`patchChildren` 消费侧零防御
- `oldNodes` 映射：null/boolean 取 `source[i]`——现在就是占位节点，正确
- 全数组对齐时，原「新增分支」的 next-sibling 搜索锚点逻辑大幅简化（占位直接 replaceChild）

#### A-3 SSR / hydration 占位序列化（`src/ui-dom/vdom/ssr.ts` / `hydration.ts`）

SSR 渲染数组子项时，null/boolean 位置输出带内容的 `<!--wf-hole: false-->`（当前 `return ''`
跳过）；非法对象同理（摘要）。hydration 按 childNodes 对齐匹配注释节点、校验内容。**SSR 与
客户端渲染同一份结构**——mismatch 从结构上不可能（§3.5 SSR 纪律加强）。

#### A-4 与 v1 占位的本质区别（防死循环误解）

v1 引擎的占位/注释 + 补全回调引发死循环（mountComponent → resolve → scheduleLocalRefresh →
renderByIds → diff 又动态挂载），v2 因此删除占位。**本方案的占位是静态的、无任何 resolve
回调**：占位只标记"此位置当前无渲染"，从不触发重渲染、从不"补全"。v2 的「动态挂载组件在
buildVNode 阶段 await 构建完 → diff 同步渲染」机制不变。占位 ≠ v1 占位。

**阶段 A 验收**：
- vdom-diff 空洞回归测试改为断言**占位语义**：patch 后 `childNodes.length` 恒等数组长度、
  `children.length`（元素）不含占位、按钮保留
- 新增：占位↔真实双向转换测试（false→Alert、Alert→false、多次往返）
- normalizeChildren 透明性测试：**用户数组引用原样参与**（无 filter 无新数组——除嵌套展开）
- SSR/hydration 占位往返测试

### 阶段 B — 范围锚点 `_childAnchors`：数组项/Fragment 统一（C-2，用户决策：数组 ≡ 隐式 Fragment）【已实施】

占位法解决空洞/文本/组件的对齐（都占 1 槽位）；**数组项（隐式 Fragment）与 Fragment 节点是
唯一"1 项多节点"**（`[fragX(2节点), textB]` → childNodes = [X1, X2, B]，textB 的 `source[1]` 取到 X2）。

- **B-1 `_childAnchors`（必选）**：renderValue 渲染数组时按位置记录每个项的 DOM 范围
  （组件 → `[其 _refNode]`；数组项/Fragment → 展开后全部节点；文本 → 文本节点；占位 → 注释节点），
  密集数组 O(n)（与既有 `Array.from(parent.childNodes)` 同量级，plain 数组遍历快于 NodeList）；
  挂父 vnode `_childAnchors`；patchChildren 的 `source` 优先取 `_childAnchors`，`source[i]` 猜测
  仅作无锚点兜底；patch 后回写（out 已含每位置范围）
- **B-2 数组项与 Fragment 节点统一**：两者走同一机制——数组项按 Fragment 语义展开（不替换
  vnode 树，透明）+ `_childAnchors` 记录范围；`collectChildNodes` 的 Fragment 展开逻辑复用
- **B-3 对齐一致性断言**（与阶段 C 合并）：`_childAnchors.length === 数组长度`，不等 → dev 抛错
  （锚点记录与 diff 消费同一份对齐，结构不一致在源头暴露）

### 阶段 K — key 数据完备：显式 key 或默认下标（用户决策 2026-12，并入规则表）【已实施：ensureArrayKeys + data-wf-key（元素直写/组件穿透多根）】

**决策**：① children 数组的**元素/组件项必有 key**——用户显式 key 或**默认数组下标**（缺省自动
赋 `key = 下标`，无需抛错）；② **所有数组项的 key 都写元素 `data-wf-key`**（显式 key 原文、默认
下标 key 写下标值——用户/devtools 直接看到每个 key 决策，零隐藏状态，SSR 同步；用户决策：
都要显示，可预期优先于 DOM 整洁）；③ 组件实例 id → 输出每个顶层节点 `data-wf-id`。

**key 语义（规则表 §3）**：显式 key = 身份匹配（增删/重排复用正确）；默认下标 key = 位置身份
（原地修改正确；动态增删中间项时后续项重建——React index key 同款，规则表明示）。

**意义**：
- **key 数据完备**：每项有 key（显式或默认）→ 规则表可陈述、diff 模型统一（无 key 位置匹配
  分支删除）；组件库 136 处 map 零改动（默认下标兜底）
- **key/id 透明化**：显式 key 在 DOM（data-wf-key）；组件实例 id 在 DOM（data-wf-id）——不再是
  纯内部字段，debug/audit/定位可见
- **pos: key 注入删除**：统一 keyed 后不再需要混合数组的位置 key 注入

**实现**：
- buildVNode/patchChildren 数组上下文：无显式 key 的元素/组件项赋默认 `key = String(下标)`
  （写入 vnode.key——规则表声明行为，非隐藏 magic）；文本/占位值不参与
- renderValue：元素渲染时 **key（显式或默认下标）** → `data-wf-key`；组件输出每个顶层节点 → `data-wf-id`
  （mount 分配 _id 后写；多根输出全部写）
- patchChildren：keyed diff 统一（oldKeyMap/movedKeys/位置校正），删 allUnkeyed 分支
- SSR/hydration：同步 data-wf-key（显式）/ data-wf-id

**验收**：默认下标 key 测试（无 key 列表删除中间项 → 后续项按 index key 重建语义 + 所有数组项
DOM 带 data-wf-key）；显式 key 列表增删/重排复用正确；data-wf-key（显式原文/默认下标值）存在、
SSR 同步、audit 校验；vdom 全组测试（现有无 key 用例走默认下标后全绿）。

### 阶段 C — 校验与断言：错位即报错（C-3/C-4/C-5）【已实施：audit.ts】

（与上版一致，占位方案下 audit 额外校验占位不变量）

- **C-1 dev 树同构 audit**（`src/ui-dom/vdom/audit.ts`）：patch 后递归校验当前范围——
  数量（childNodes.length === 数组长度，fragment 边界除外）、类型（native type === tagName）、
  锚点有效（`_refNode` 仍在 DOM 内）、**占位位置正确（真实项不是占位）+ 占位内容分类**
  （`wf-hole: object …` 计数 > 0 → 有非法输入 warn；`wf-hole: false` 为正常条件渲染）
  。开关 `__WF_VDOM_AUDIT`（dev/测试全开，生产默认关——零开销）；`__WF_VDOM_STRICT`
  （dev 默认关）把非法占位升级为 throw
- **C-2 invariant 断言模块**（`src/ui-dom/vdom/invariant.ts`）：文档不变量 → 代码断言，
  关键点：patchValue 组件分支已构建、patchChildren 输出 `out.length === newChildren.length`、
  **占位替换后 childNodes 长度不变**、doRender `_refNode` 有效或明确 null
- **C-3 错误路径增强**：`_parentVNode` 链输出组件路径「App > DemoForm > Form > Button」

### 阶段 D — 可预测性：确定性测试 + 诊断工具（C-6）【已实施：vdom-determinism + trace】

（与上版一致，占位语义并入）

- **D-1 determinism 套件**（`src/test/vdom-determinism.test.ts`）：幂等渲染（连 patch 两次
  DOM 快照一致）、双树一致性（vnode 结构 === DOM 结构，audit 全量版）、空洞/展开/portal 混排
  矩阵、无随机依赖、锚点稳定性
- **D-2 diff trace**（`__WF_VDOM_DEBUG` / `?vdom_debug=1`）：结构化日志——build（剪枝/工厂
  重跑/新 id）+ patch（每项操作=patch/replace/insert/skip、锚点来源=childAnchors/refNode/占位）+
  结束 audit 摘要。**事故复现 = 开 trace 重放交互**（本次事故若有 trace，30 秒定位）
- **D-3 文档同步**：闭环后更新 AGENTS.md §4.0/§6.3（filter 防线 → 占位法防线）+ design 本文件标闭环

### 阶段 E — 属性转化一致（用户决策 2026-12：属性层尊崇节点层原则）【已实施：eventTarget/enumerated/class/innerHTML 三通道】

**原则映射**：节点层六原则（透明/显式/宽容诊断/单一规则源/诚实裁剪/三层一致）逐条应用到属性层——
用户写的 props 原样进 vnode.props，转化为 DOM attribute/property/event 的路径唯一清晰。

**问题清单（实测确认）**：

| # | 问题 | 实测证据 |
|---|------|---------|
| P2 | innerHTML + children 并存：render 跳过 children（`'innerHTML' in props`）、diff 的 patchChildren 不跳 → **行为分叉** | 首帧 `<span>X</span>`，diff 后 `<span>X2</span><span class=child>Y2</span>` |
| P3 | class 形态切换旧值残留：`classList.add` 只加不清——`'a b'` → `{a:true,b:false,c:true}` 结果 `a b c`（b 残留） | 实测 className = 'a b c' |
| P8 | 事件捕获变体静默失效：`onClickCapture` 被 EVENT_RE 匹配后 `addEventListener('clickcapture')` 绑定错误事件名 | 实测只触发 bub，capture 无效果无警告 |
| P5 | enumerated 名单硬编码仅 3 个（draggable/contenteditable/spellcheck）——value-based 枚举漏项即重演 draggable 事故；presence-based（controls/multiple/download）空字符串恰好正确 | controls=true 实测正确，但无规范白名单 |
| P7 | select value 延后（renderValue options 后设）vs diff 直设——两条特殊路径规则不一致 | 代码审查 |
| SSR | 属性输出第三套实现（renderSsr 自拼 attribute 字符串）——与 setProp/patchProps 漂移风险 | 代码审查 |

**方案（单一规则源 `attribute-transform.ts`）**：

```
classifyProp(key, value):   // 属性三通道分类，唯一判定
  ├─ event 通道：/^on[A-Z]/ → { type: 小写化, options?: { capture } }  // 捕获变体明确支持或 warn 拒绝
  ├─ property 通道：value / indeterminate / 受控表单语义（React 同款）→ property 直写
  └─ attribute 通道：data-* / aria-* / boolean / enumerated / 普通 → setAttribute
      enumerated 规范白名单（对照 HTML 规范，替代硬编码 3 个）：
        value-based（空字符串=false，显式 'true'/'false'）：draggable/contenteditable/spellcheck/…
        presence-based（存在=true，空字符串）：controls/multiple/download/hidden/disabled/…
```

消费方：setProp（render）/ patchProps（diff）/ renderSsr（SSR）全部调用 `classifyProp`——
**禁止各自实现属性判定**（grep 审计「`addEventListener`/`setAttribute`」判定收敛）。

**修复**：
- P2：innerHTML 存在 → children 不渲染的规则收敛到 classify 层，render/diff/SSR 三处同一判断
- P3：class 先清后设（旧值按形态反解析清除，再设新值）——class 规则单一实现
- P8：捕获变体**支持**（`addEventListener(type, fn, { capture: true })`，合法事件语义）或显式 warn
  拒绝——绝不绑错事件名静默失效
- P7：select value 统一（受控表单语义归 property 通道，延后逻辑只在首帧 options 就绪场景）

**验收**：P2/P3/P8 回归测试（上述实测转断言）；enumerated 白名单完整对照 HTML 规范 + 新增
value-based 枚举用例；SSR 属性输出与客户端 classifyProp 一致对比测试；grep 审计属性判定收敛。

---

## 3. 明确不做（诚实裁剪）

- **filter 方案（上版）**：已废弃——magic 违背透明性（本修订版核心决策）
- **fiber 树/双缓存**：轻量方案 + 结构保证 + 测试兜底是既定取舍
- **生产常开 audit**：O(n) 递归——dev/测试全开，生产默认关
- **MutationObserver 自愈**：外部改 DOM 本就是 §5.5 红线，不为此建机制
- **fiber 树/双缓存**：轻量方案 + 结构保证 + 测试兜底是既定取舍（React 对照 §6.3）
- **keyed diff 算法重构**：现状已过全量测试，不在一致性范围

## 4. 验收标准（发布前全量）

1. `npm test` 全绿（新增：占位往返、childNodes 恒等、SSR/hydration 占位、audit 负例、determinism）**✅ 1794/1794**
2. **audit 全开下全量测试全绿**——一致性基线（占位不变量 + 同构校验全部通过）**✅**
3. agent-browser 实测：Form 提交（验证错误 + 成功两路）按钮保留；`?vdom_debug=1` 输出完整
   patch 轨迹（占位操作可见）且 audit 通过 **✅**
4. perf 不回归：文本 patch / keyed 1000 行基准与 v3 闭环持平（占位节点创建成本 ≤ 被替代的
   filter + next-sibling 搜索成本）**⚠️ 未单独跑正式基准**——占位是注释节点（零布局成本），
   理论成本低于被替代的 filter+搜索；V3 零拷贝/引用短路保留
5. AGENTS.md §6.3 更新为占位法防线；不变量文档与实现一致 **✅**

## 5. 风险与回退

| 风险 | 缓解 |
|------|------|
| 占位节点对外可见（innerHTML 出现注释） | 注释不影响布局/textContent/children（元素集合）；audit 与 trace 反而受益；SSR 序列化一致 |
| 占位节点数量 = 空洞数量，极端场景（map 大量 false） | 空洞通常远少于真实节点；每占位成本 = 一个注释节点创建（O(1) 微成本）；bench 验证 |
| 误以为 v1 死循环复发 | A-4 明确：静态占位无 resolve 回调、无补全触发——v2 构建机制不变 |
| SSR/hydration 结构变化 | A-3 两侧同步改 + 往返测试；现有 hydration 测试校准 |
| 阶段耦合回滚困难 | A 独立（核心）→ B 可选 → C/D 依赖 A；每阶段独立验收 |
| **多实现漂移（五路径各写判定，某处漏改 → 转化分叉）** | 阶段 0 单一规则源先行——children 形态判定收敛单一模块 + grep 审计验证（验收第 5 条）；这是确保透明的重要一步 |

---

## 附：与既有计划的边界

- `vdom-perf-plan.md`（v2）/ `vdom-perf-v3-plan.md`（v3）：性能优化已闭环——本计划保留其全部
  收益（占位法反而**简化** diff：删除 filter、简化 next-sibling 搜索；零拷贝完整恢复）
- `vdom-coverage-plan.md`：测试覆盖——新增测试并入矩阵
- `render-only-plan.md`：状态模型——渲染触发语义不变（`render()` 唯一入口）
- **AGENTS.md §6.3**：当前记录 filter 防线（已实施的现状）；本计划闭环时更新为占位法
