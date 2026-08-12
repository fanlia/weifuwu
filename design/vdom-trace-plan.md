# vdom Trace 调试系统 + Fragment 顺序 Bug 修复计划

> 状态：✅ 已闭环（2026-12）
> 起因：agent-platform 工作空间文件区「三元 Fragment 切换编辑视图渲染空/错乱」——app 独有失败、框架测试全绿，
> 已确认框架 bug（同一框架同一结构不同位置表现不同），根因未锁定（测试环境与 app 环境存在盲区差异）。

## 0. 最终结论（三个独立框架 bug，trace 定位，已全部修复）

| # | bug | 根因 | 修复 | 回归测试 |
|---|-----|------|------|---------|
| B1 | keyed 分支位置校正拆散多节点 Fragment 集合（Card 内三元 Fragment 切换后 edit-plain 被挤到尾部） | `last.previousSibling !== lastDom` 误判 + 只移动集合最后节点 | 集合整体移动（首节点判断 + 逐节点 insertBefore 保持顺序） | frag-keyed-correct.test.ts |
| B2 | 数组项 ARR(0)→ARR(2) 递归 diff 新内容插到容器最前/末尾（文件按钮跑到 Card children 首部） | 数组项配对递归内层 keyed 分支 `lastDom=null → parent.firstChild`；allUnkeyed `appendChild`——忽略 oldRange 位置 | 新增锚点 = 旧数组项范围 end 标记前（arrEnd） | frag-arr-content-change.test.ts |
| B3 | 三元两侧不对称（div ↔ Fragment）切换残留（编辑视图下方挂旧列表） | Frag→div 只 replaceChild 锚点；div→Frag 把 div children 当 Fragment diff；DocumentFragment 插入后 childNodes 清空后读取 | removeOldOutput（整体移除旧输出 + 组件 dispose）+ Fragment 分支整体替换 + 插入前捕获 fragNodes | frag-native-switch.test.ts |
| B4 | Fragment/数组项 ↔ false/null 占位互换残留（条件消失后旧节点挂 DOM） | patchChildren「真实 → 占位」只 replaceChild 锚点（Fragment 的 _childNodes[0] / 数组项 start 标记）——其余节点残留 | 真实→占位分支对 Fragment/数组项整体移除（rangeFor/removeOldOutput）+ hole 插到范围位置 | frag-hole-switch.test.ts |

**frag-matrix.test.ts**（全矩阵防回归）：Frag/数组项/文本/元素/组件/false/null 在数组与单值 children 上下文中两两切换 + 互逆方向 + 嵌套 Fragment——每次切换断言前类型零残留、当前类型位置正确。

**根因链（plan 原假设修订）**：
- 原假设「首帧渲染顺序错乱」不成立——首帧 renderValue 顺序正确（jsdom/真实浏览器均验证）
- 实际错乱全部发生在 **diff 路径**（loadWsList 完成后的 rerender）——app 首帧 wsEntries=[]（空数组）→
  加载完成 ARR(0)→ARR(2)（B2）+ 后续三元切换（B1/B3）
- 「点击后编辑视图被误删/错乱」= B3（Frag→div 残留）+ B1（keyed 校正拆散集合）复合

## 1. 问题背景（已确认的事实链）

| 事实 | 证据 |
|------|------|
| JSX 编译产物正确 | `jsxs(Fragment, {children: [div, false, false, map结果]})` 顺序无误 |
| 框架层 6 个测试文件全绿（含顺序断言） | node/jsdom 环境无法复现 |
| app 里 Card 外 Fragment + map 顺序正确 | `#mini-test` = [FIRST, start, A, B, end] ✓ |
| app 里 Card 内三元 Fragment 首帧顺序错乱 | DOM = [btn, list-simple, hole, hole, start, end]（应为 [list-simple, hole, hole, start, btn, end]） |
| 排除模块分裂（§6.1） | bundle 单模块图：Fragment/renderValue/buildVNode/patchValue 各 1 次 |
| 点击后编辑视图被误删 | `[arr-remove]` rangeFor 移除范围误含 edit-plain（因首帧锚点错位） |

**根因链**：
```
首帧渲染顺序错乱（map 数组项跑到 Fragment children 最前、fragment-start/end 标记位置错）
  → DOM 锚点错位（_childAnchors / fragment 标记基于错乱 DOM）
  → diff 时「旧数组项移除」rangeFor 误删编辑分支新内容
  → 点击文件后编辑视图消失
```

**未锁定的最后一环**：`children` 数组顺序在哪个阶段开始乱——buildVNode 输入 → Fragment 输出 →
renderValue Fragment children → DOM childNodes。**需要 trace 系统抓首帧日志**（现有 hook 时机抓不到）。

## 2. 目标

1. **建立 vdom 全面 trace 调试系统**：阶段级开关（build/render/diff/mount/audit）、渲染会话 traceId 关联、
   children 顺序可视化摘要、URL/全局变量/localStorage 三路开启——一次建立，长期复用
2. **trace 驱动定位 Fragment 顺序 bug 根因** → 修复 → 框架测试（防回归）
3. **清理现有散乱 debug**（[frag-build]/[frag-diff]/[pos-patch]/[arr-remove]/[card-diff] 等临时日志）

## 3. Trace 系统设计

### 3.1 阶段与级别

| 阶段 | 覆盖模块 | 关注点 |
|------|---------|--------|
| `mount` | mount.ts / serve.ts / mountRoot | 渲染入口（renderByIds/首帧/导航）、patch 完成 |
| `build` | build.ts | vnode 构建：数组 key 分配、组件剪枝/重跑、Fragment/native children 递归 |
| `render` | render.ts | vnode → DOM：数组分支、Fragment 分支、组件/native、锚点记录 |
| `diff` | diff.ts | patch：old/new children 顺序、allUnkeyed/keyed 配对、数组项移除范围 |
| `audit` | audit.ts | 结构校验结果（转发现有 audit） |

级别：`error < warn < info < debug < trace`（info 起默认；debug/trace 明细）。

### 3.2 开启方式（三路）

```ts
// 1. URL query（服务端 uiServe 注入全局——首帧日志可抓）
//    ?vdom_trace=build,render,diff        （阶段子集）
//    ?vdom_trace=render:trace             （阶段 + 级别）
//    ?vdom_debug=1                        （全开 debug——兼容旧开关）
// 2. 全局变量（页面加载前注入）
//    window.__vdom_trace__ = { stages: ['build','render'], level: 'debug' }
// 3. localStorage（运行时切换）
//    localStorage.vdom_trace = 'render:debug'
//    再 reload——首帧生效
```

### 3.3 traceId（渲染会话关联）

每次渲染入口（doRender / renderPath / mountRoot.mount）分配唯一 id：`R{seq}`——
同一会话的 build→render→diff 日志共享 traceId，事故可完整回放。

### 3.4 摘要函数（结构化打印——children 顺序可视化）

```ts
kidsSeq([div#list-simple, false, false, [btn]])
// => "[div#list-simple | false | false | ARR(1)]"

vnDesc({type: Card, key: '2'})    // => "Card#2"
nodeDesc(<!--fragment-start-->)   // => "<!--fragment-start-->"
```

**这是定位 Fragment 顺序 bug 的关键工具**——children 顺序在各阶段的可读快照。

### 3.5 日志格式

```
[vdom:mount]  R12  render id=_wf_18 comp=AgentDetail
[vdom:build]  R12  array kids=[Card#0 | Card#1 | Frag | ...]
[vdom:build]  R12  fragment kids=[div#list-simple | false | false | ARR(1)]
[vdom:render] R12  fragment kids=[div#list-simple | false | false | ARR(1)]
[vdom:render] R12  array  fid=1 kids=[btn#wsf-notes.md]
[vdom:diff]   R12  patchChildren old=[...] new=[...] mode=unkeyed
```

前缀 `[vdom:{stage}]` + traceId + 消息——grep 单阶段 / 单会话。

### 3.6 性能

- 关闭时零开销：`trace()` 首行 `if (!cfg.enabled) return`；插桩点 `traceEnabled()` 前置检查
  （关闭时连参数求值都跳过——`if (traceEnabled('build')) trace(...)`）
- 开启时高频路径（diff 每位置）默认 trace 级（低于默认 debug 不打印）

## 4. 实施步骤

- [x] **S0 设计**：本文档
- [x] **S1 实现 trace.ts**：配置解析（三路开启）+ trace/traceEnabled/nextTraceId + 摘要函数（kidsSeq/vnDesc/nodeDesc/childNodesSeq）
- [x] **S2 插桩**：mount.ts / serve.ts / build.ts / render.ts / diff.ts 各阶段——含关键决策点：
      patchChildren mode 分支选择（keyed/unkeyed + hasUserKey/hasArrayItem）、keyed-correct 位置校正、
      session-end DOM 摘要（trace 内正确 vs trace 外被破坏的对照）
- [x] **S3 清理散乱 debug**：移除 [card-debug]/[ws-debug] 等临时日志（AgentDetail.tsx 已恢复原代码）
- [x] **S4 trace 复现 app 顺序 bug**：`?vdom_trace=diff:debug` 抓首帧+loadWsList 序列——
      **定位为 diff 路径错乱（非首帧 renderValue）**：B2 数组项 ARR(0)→ARR(2) 递归新增插错位置
- [x] **S5 修复根因** + 框架测试（B1-B4 四类 bug + frag-matrix 全矩阵防回归，见 §0）
- [x] **S6 回归**：框架相关测试组（fragment 20 + vdom 137 + components 1079）+ tsc 全过；app 真实浏览器验证闭环
- [x] **S7 文档**：trace 用法在设计备注（本文档）+ trace.ts 源码注释（AGENTS.md §10：内部工具不写 docs/）

## 5. 验收标准

- [x] `?vdom_trace=build,render,diff` 能抓 app 首帧/rerender 各阶段 Fragment children 顺序（trace 系统有效）
- [x] trace 日志显示顺序乱的具体阶段（diff 路径：keyed-correct / 数组项递归新增 / Frag 整体替换）
- [x] 修复后 app 文件浏览器点击文件 → 编辑视图正常渲染（无残留，完整闭环）
- [x] 框架测试新增顺序断言场景全绿（frag-matrix 等 9 个新测试文件，防回归）
- [x] 全量测试 ≤15s 预算内、tsc 通过
- [x] 无散乱 debug 残留（grep `\[frag-|\[pos-patch|\[arr-remove|\[card-diff|\[ws-debug|\[frag-build` 为空）
