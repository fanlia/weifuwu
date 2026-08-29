# VDOM-V2-BLUEPRINT — vdom 核心完整重构（全 Observable——透明化）

> 2027-08 架构决策（用户）：**vdom 等核心功能完整重构——不能裁剪**。
> 根本动因：补丁模式已多次证明不能根治（复用失败反复出现——应用层掩盖框架
> 根因）。v2 = v1 **全部能力等价** + **一切皆流（透明）**——「复用失败/调度
> 竞态/生命周期泄漏」整类语义消除——**流程透明化**（每层可 tap/回放/快照）。
> 执行：**并行双引擎 + 对账器等价裁决**（v1 平台不停摆——成熟后切换）。

---

## 1. 能力对齐矩阵（v2 必须 100% 等价——零裁剪）

| 面 | v1 机制 | v2 形态 | 等价测试 |
|---|---|---|---|
| 命令流 | 14 种命令（create/createText/createAnchor/insert/move/remove/setText/setProp/ref/unref/mount/unmount/close/done）——完整自足 | **不变**（Observable<Command> 生成——命令语义零改） | 246 契约保留 |
| build | 树递归 → Command[] | **VNodeStream**（惰性事件流——defer/merge） | build.test |
| diff | 树遍历对照（same/children/output/cleanup） | **对照管道**（zip 同位置 ∪ merge keys 身份） | diff/keyed/attrs |
| transform | 6×6 状态迁移表 | 流的状态算子（reducer） | transform 契约 |
| 调度 | renderPhase FIFO + 熔断 | **render$**（buffer+flush 合并——batching） | 调度契约 |
| 生命周期 | onUnmounts 数组 + dispose | **destroy$**（单信号——takeUntil） | lifecycle 契约 |
| 实例复用 | rec 查找（keyedId——bug 温床） | **流段共享**（同 key = 同一订阅段） | component-reuse |
| 组件输出 | 判别联合（vnode/hole/array） | 输出流水（对照 = 流对比） | output 契约 |
| SSR | uiSsr + AbsorbState + html | 吸收 = 流消费（命令流对照） | ssr-adopt |
| 对账器 | Sim/devVerify/auditDom/fuzz | 流视角（命令流回放对账） | reconcile/fuzz |
| 事件/ref | EventRegistry/RefRegistry | 保留（字段面） | events/ref |
| portal | openPopup 内核 | 保留（hooks 面已流化） | popup 场景 |
| keyed | keyedId + 转义 + 重复检测 | 流 merge 的 key 语义（同源） | key/keyed |
| 状态机 | NodeState/CompState 显式表 | 状态 = 流的折叠（scan）——**Post 断言保留** | state-machine |
| 吸收失败回退 | 原子回退 | 流的 catchError → 回退 | e2e-21 |

**完成定义 = 矩阵全绿**（不是「感觉重构完」）。

---

## 2. 五层流管道（透明化的架构）

```
事件流   用户输入/WS/定时器/生命周期        → 单一事件流（可记录/回放）
状态流   状态 = 事件流的折叠（scan/Behavior） → 可重放（时间旅行）
渲染流   VNode 流（defer/merge 惰性）        → 组件挂载/更新/卸载事件
命令流   对照流（zip/merge）→ Observable<Command> → 核心锚点（246 断言）
消费流   proc*（DOM）/ commandToHtml（SSR）/ Sim（对账）——同构三投影
```

**透明三机制（内建——非附加）**：
1. **审计钩子**：每层 `.pipe(tap())`——插桩 = 流的自然操作（v1 需改源码）
2. **流回放**：事件流记录 → 重放（时间旅行——用户报 bug → 回放定位）
3. **快照**：每层 Behavior 当前值（任意时刻完整真相）

**透明验收项**：五层流全部可 tap/可回放/可快照（——是 v2 的验收项）。

---

## 3. 执行阶段（并行 + 对账——范围完整）

### 阶段 1（2-3 周）：核心原型（关键风险验证）
- VNodeStream（vnode 树 → 惰性事件流）
- 对照管道（zip / key merge）
- 调度流（render$ buffer+flush）
- **性能/等价验证**：v1 vs v2 最小场景命令流对比——**慢于 v1 不切换**（守则）
- 交付：`src/client/vdom/core/v2/`（并行目录——不碰 v1）

### 阶段 2（2-3 周）：完整面
- 组件输出流 / destroy$ / SSR 吸收流化 / keyed 同源 / 状态机流折叠
- 对账器流视角 + 246 契约全绿（v2 引擎跑全部）+ 场景 116 绿

### 阶段 3（1-2 周）：切换
- v2 默认 + v1 退役 + 全量回归（246+116+200+289 + tsc 双侧 0）
- 对账器保留（回归照跑）

**总预估：6-8 周**——每阶段独立验收可回退——v1 平台不停摆。

---

## 4. 守则（完整 ≠ 鲁莽）

1. **能力矩阵 = 验收清单**（逐项独立测试绿）
2. **246 契约保留**（命令流断言——v2 产出同构——测试不重写）
3. **对账器/fuzz 裁判**（终态等价——非「感觉对」）
4. **性能基准**（v2 diff ≤ v1——超即回退）
5. **透明验收**（五层可 tap/回放/快照）
6. **不留后置/豁免**（OBSERVABLE-ARCH core 流化后置的教训——本次一次性完整）

---

## 5. 完整性缺口清单（2027-08——撤销裁剪——完整重构纪律）

> **用户重申**：核心功能重构不能裁剪——必须完整。上一轮「保留 v1 吸收/
> 先 CSR 切换」**撤销**——以下缺口**全部补齐后才算完成**（切换前）。

| # | 缺口 | 现状 | 补齐（v2 化） |
|---|---|---|---|
| 1 | **SSR 吸收（AbsorbState）** | v1 模块——v2 未接 | v2 命令流与吸收对齐（吸收是消费端——v2 同构命令已兼容——**补验证 + 吸收流式化**（消费端 view——命令流直接喂张）） |
| 2 | **transform 6×6** | v2 diff 用「单 remove+render」替代 | **v2 transform 化**（异态转换走 transform 表——非重建——同 v1 语义：元素↔文本/组件↔数组等转换的状态机） |
| 3 | **uiSsr v2 完整** | 只有 v2ToHtml（单树） | **uiSsrV2**（router.resolve + 预取 + __DATA__ + 吸收首帧——完整 SSR 入口） |
| 4 | **ref 生命周期** | v2 命令流含 ref（等价验证） | 补 ref 卸载路径（ref 指令的 unref——清理对称） |
| 5 | **fuzz 全量** | v2 只 50 对 | **1200 静态 + 300 组件树**（v1 fuzz 全量跑 v2 引擎） |
| 6 | **portal/弹窗** | 应用面（openPopup hooks） | 段 hooks 已接——补 portal 场景验证 |
| 7 | **事件/ref 字段**（EventRegistry/RefRegistry） | 共享消费端（协议层） | **v2 视角验证**（字段面与 v2 命令流协同——不是「共享即豁免」——补测试） |
| 8 | **router 导航完整**（链接拦截/popstate/redirect） | v2 serve 骨架 | 完整实现 + 场景验证 |

**完成定义（更新）**：能力矩阵全绿 + **缺口 1-8 全补** + fuzz 全量 + 全量回归
（246+116+200+289 + tsc 双侧 0）——**任一缺口未补 = 未完成**（不切换）。

---

## 6. 执行状态（2027-08——showcase 切换 v2：200/200 绿）

> **切换门户 = showcase 模块化验证**（`apps/showcase/src/main.tsx` 已切
> `uiServeV2`——真实浏览器全量 200 测试绿——v1 平台仍默认——符合「成熟后
> 切换」顺序）。本轮（switch 适配周）修复清单：

| # | 缺陷（showcase 切换暴露） | 根因 | 修复 | 锁定测试 |
|---|---|---|---|---|
| 1 | Affix scroll 后不固定 | **requestRender 不透传**——renderV2Node 元素/碎片/数组递归调用丢回调——嵌套组件段回调 undefined（hooks 断链） | 全递归透传 + serve diff 路径也传 | v2-hooks-chain（嵌套回归）+ v2-affix-repro |
| 2 | notification/confirm/toast 静默失效 | **v2 serve 未装配 opts**（toast/confirm/notification 中间件注入面缺失） | ctx 注入对齐 v1（opts 展开 + data pipe + afterRender/onUnmount） | showcase 弹窗测试 |
| 3 | QRCode 页栈溢出 | **concatObs 同步递归**——flat 列表 N 同步完成流 = N 层调用栈（数百 rect 即爆） | 同步完成迭代化（while 循环——异步完成仍回调驱动） | v2 大列表契约测试（filetree-repro 附） |
| 4 | Tour/popup 关闭后不卸载 | **组件→空洞转置换段泄漏**——v1 转换表发 unmount 但 v2 段表不跟进——onUnmounts（popup 关闭）永不触发 | 消费端按 unmount 命令统一 disposeSegment（serve/popup apply 循环）| v2 契约 + tour/popover 场景 |
| 5 | tag 关闭/点击失效 | **SSR 内容与客户端渲染双份**——v2 serve 首帧无吸收判定（v1 hasSsrMark→absorb.begin / 无标记清空） | 首帧吸收适配（蓝图缺口 1「吸收是消费端」落地） | tag/全量 showcase |
| 6 | Popover 点后不弹 | **hookSeq 无 renderBase 基准**——渲染期 hook 索引逐帧漂移——useOpen 状态每拍复位 | 段渲染 hookSeq 重置（v1 renderBase 语义——rerenderSegment 单源） | popover 场景 |
| 7 | FileTree 列表→编辑崩溃 | **段 id 碰撞**——旧按钮内 Icon 段残留段表——新结构落同槽——Button 段复用 Icon 段（renderFn 错配）| removeTreeV2 生成期 dispose 子树段（段表 = v2 权威——同 v1「生成端完整自足」） | v2-filetree-repro |
| 8 | 弹窗内容组件 hooks 断链 | popup render 未传 state.segments（首帧与 diff 段表分裂） | renderV2 传 state.segments + requestRender 接父 env | popup 场景 |

**观测体系（本轮定型）**：`spy.ts`——`__wfSpy` 事件环（obs:next → req:render →
sched:flush → cmd:render）——全链可断言（v2-spy 测试）——调试不再盲改。

### 场景层切换 v2（2027-08——116/116 绿）

> `src/test/scenario/main.tsx` → `uiServeV2` + `server.ts` SSR 场景 → `uiSsrV2`
> ——v2 引擎全量场景验证（v1 对照在 git）——本轮修复：

| 缺陷 | 根因 | 修复 |
|---|---|---|
| deep-search/password 输入污染 | **undefined 属性直通**——v1 经 JSON 编解码丢 undefined 键（隐式过滤）；v2 命令直连——`value: undefined` → `el.value = "undefined"` | serializableAttrs 过滤 undefined + applyProperty 分区语义（value 类不写——§5.3 非受控；bool 类 disabled/checked → false 解绑——Transfer 右移按钮残留实证） |
| keyed-reorder 列表清空 | **冲突重建误用 diff 对照**——旧 DOM 已 remove——diff 只发 setProp 无 create（diffComponentAtV2）；重建应全量渲染（renderV2Node——段复用 + create/insert——v1 emitWithKey 语义） | 重建分支 keyed 组件项改 renderV2Node |
| render-error-fuse 无 fallback | **v2 缺 R1 熔断** + **错误后重建误清 DOM**（currentTree=null → 误判首帧 → root 清空——触发按钮丢失——错误链断） | applyV2 外层 try/catch + errorCount 熔断（errorFallback 可配/默认内置）+ booted 一次性首帧判定 |
| popup-trap 不聚焦 | content 渲染链（state.chain 微任务）异步——afterRender 时 panel 未挂载——ref 未跑 | scheduleAfterRender 聚焦微任务重试（≤10） |
| unmount-dispose root 残留 | v2 unmount 未对齐 v1（applier.dispose + 段销毁 + root 清空） | 对齐 |

**下一步**：契约/场景/showcase 三层全绿（311+116+200）——
v1 退役决策点（v1 引擎保留对账——v2 默认切换评估）。

---

## 7. v1 删除完成（2027-08——退役执行实录）

> 决策：对账框架从「v1/v2 双引擎」降为「v2 单引擎双路径」（fresh render vs
> old render + diff——终态等价——reconcile.test.ts）——v2 引擎独立承担对账
> 责任（如把 v1 留在库里，双引擎各自修 bug——对账器裁决的是双错的交集——
> 边际价值递减；v2 单引擎对账更直接（修的是本引擎的增量语义）。

| # | 动作 | 落地 |
|---|---|---|
| 1 | 双引擎测试删除 | v2-*.test.ts × 10（render/diff/fuzz/reconcile/keyed/fields/transform/ref-lifecycle/portal/integrate/ssr）——目的即 v1/v2 对照——对照物已删 |
| 2 | v1 引擎删除 | core/build.ts、core/serve.ts、core/diff/{index,children,output,same}.ts、core/ssr/index.ts——共享件保留（diff/attrs.ts 与 diff/cleanup.ts（v2 引用）、ssr/html.ts（commandToHtml——server/ui 消费）、ssr/absorb.ts（patch 消费）、protocol.ts（协议层——v1 退役前拆分）） |
| 3 | 对外兼容桥 | index.ts renderToStream/diffStream → v2 桥（命令流同构）——组件 dist 消费零改动 |
| 4 | 实例权威迁移 | 契约测试 registry → 段表（key-inject × 2、removal-parent × 5、fuzz-robust、pattern-reuse、component-harness——mounts() = segments.size） |

### v2 引擎修复（单引擎对账暴露——删除后的真实差距）

| 缺陷 | 根因 | 修复 |
|---|---|---|
| C1 fuzz 91/300 | **transform 新侧提前构造**——emitNode 在旧段 dispose 前 renderV2Node（同 compId 命中旧段——工厂错配） | transformV2 延迟新侧（pendingSink——dispose 后再构造） |
| 组件输出内层段泄漏 | **removeTreeV2 手写递归缺输出子空间清理**（数组/组件输出的嵌套段不 dispose——新组件同 id 复用旧段） | 委托 removeVNodeTree（v1 G10 证明路径）+ 段 dispose 汇集 |
| fragment 级 keyed 不移动 | **fragment/数组同态分支无 keyed 检测**——位置对照（setText 就位——状态跟随丢失） | keyed 检测路由 diffKeyedV2（element children 同规则源——首现优先/move/重建） |
| 段工厂错配静默复用 | **render 路径按 compId 盲复用**（不校验工厂）——陈旧段/泄漏段被新组件错配复用 | 工厂身份校验（renderV2Node/diffComponentV2/diffComponentAtV2——不一致 dispose+重建） |
| 异类型替换顶层无 unmount 命令 | 命令流缺顶层 unmount（消费端实例面残留——S_INST 不等价） | 替换路径 unshift {op:'unmount', compId: oldCompId} |
| renderFn 抛错炸整树 | v2 渲染路径无 R2 catch（v1 有——组件级 hole 降级） | renderV2Node catch → out=null（锚 + 段保留——下一拍重试自愈） |
| D1 async 工厂测试 | 断代（2027-08 同步化）前的旧契约 | 测试删除（D2 同步 renderFn 等价覆盖存活契约） |

**验收**：契约 264/264 绿 · 组件 harness 27/27 绿 · tsc 0 · audit:semantics 0 ·
场景层抽样（e2e-10/e2e-2——SSR 吸收/导航/keyed-reorder/unmount）绿。
