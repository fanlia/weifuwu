# VDOM-STREAM-FIX-PLAN — 走查实证缺陷修复 × Observable 优势深化

> 触发：agent-platform 用户视角全页走查（2026-XX）暴露 3 类 vdom 时序缺陷
> （G12 注册竞态 / G13 api 重试竞态 / G14 rAF 停摆恒 0）——均为**异步时序**问题。
> 本计划：修复根因 + 把 Observable 优势（取消/时序显式/回放/单飞）用在
> **有场景证据**的位置——遵守既有纪律（不加仪式流、收益判负留档、每机制单轨）。

---

## 〇、架构总纲：四类判别（全流化问题的定稿回答）

> **命题**：「不该流的改为状态机——整个 vdom = Observable + 状态机」——方向正确，
> 但精确化为**四类正交**（"不该流的"实为三种不同性质）：
>
> | 判别问题 | 归类 | 纪律 | 反例 |
> |---|---|---|---|
> | 多值随时间 + 取消/组合？ | **流** | 事件源单轨、卸载自动退订 | — |
> | 有状态集合且存在**非法迁移**？ | **状态机** | 显式枚举+迁移表+违例 Reject（静默 no-op 是违例） | 两态布尔容器硬套迁移表=仪式 |
> | 同步无状态输入→输出？ | **纯函数** | 表驱动可查表（transform 6×6） | build/diff 无"当前状态"概念——套状态机=过度设计 |
> | 有身份需跨渲染持久但无迁移规则？ | **槽位/实例数据** | G14 教训成文：handle 必须槽位持久化（nextHookIndex/getHookState） | 容器不是状态机——存储策略≠迁移规则 |
>
> **合成形态（已在代码）**：machine$ 模式——事件流 → scan(reducer) → 状态写回
> + 违例流事件（AbsorbState/PopupPhase）——状态机管迁移合法性，流管事件到达时序。
> **验证分工不变**：状态机=必要条件（迁移合法+无静默）· 对账器=充分验证（终态等价）
> · 流回放=时序确定性——三者缺一不可。
>
> **全流化已被实证否决**：P3 节点级流化（6000 行=48000 流对象）回退单数组收集——
> 同步纯计算套流=分配税+零时序收益。本计划 W1–W3 是"把该流的流完、
> 不该流的钉死在判别表里"，而非扩大流化面积。

---

## 一、现状与证据（走查实证——非空想）

| # | 缺陷 | 实证 | 现状 |
|---|---|---|---|
| 1 | **"路由页 ctx.render 不落地"**——Templates.tsx 登记（v1 时代注释：renderOne patch 不落地——登记专项任务）+ 走查 popstate 实验疑点（mock fetch 后 dispatch popstate → `mockHits=0`——handler 疑似未重跑） | Templates 异步数据到达后页面空态（偶现）；popstate 实验未深挖 | **未定位**——resolvePath→router.resolve→handler 链路逐环无测试 |
| 2 | **组件级重渲染链路未验证**——`requestRender → requestSegmentRender → rerenderSegment → diff` 在 rAF 驱动场景（动画帧回调 rerender）下是否每帧落地 | G14 走查：Agent 卡 rAF scheduled 后 step 日志零出现（无头环境）——但正常浏览器下未证 | G14 临时直落终值（应用侧兜底）——**根因链未修** |
| 3 | **api 中间件手写异步时序**——401→refresh→retry 竞态用快照比对 hack（G13 修复）；客户端唯一还在手写重试/单飞时序的模块（useAsyncData 已流化 state$+switchMap） | G13：并发 401 用已作废 refreshToken 再刷 → 静默空数据/误踢登录 + 无限重试循环 | 已修（快照+上限）——**hack 性质，未流化** |
| 4 | **hooks 时序源各自为政**——rAF（useTween）/setInterval（StatCard countdown）/setTimeout（popup/notification）无统一环境降级纪律 | G14：rAF 停摆 → 动画类 hook 恒起始值 | StatCard 已直落；其他 hook 未审计 |

**Observable 现有资产**（VDOM-OBSERVABLE-COMPLETE/OPTIMIZE 已归档）：自研 observable
（Subject/BehaviorSubject/switchMap/combineLatest/merge/debounceTime/throttleTime/
distinctUntilChanged/finalize/take/startWith）+ derived + useAsyncData/useObservable。
**调度器**：schedule.ts 风暴检测（事件间隔）+ spy 回放已有。

---

## 二、波次

### W1 重渲染落地性定位（P0——正确性——测试先行）✅ 完成（vdom-stream-fix f2313106）

**原则**：先写逐环契约测试，定位断链环节，再修——不允许"疑似就改"。

- **W1.1** 契约测试 `v2-rerender-land.test.ts`（node 直跑——fake DOM/无头）：✅
  - `ctx.render()` → scheduler flush → resolvePath → **router.resolve 调用 handler**（spy 计数）
  - 同 URL / query 变化 / hash 三形态分别断言 handler 重跑次数（hash 走 popstate 面）
  - popstate → 同上
- **W1.2** 契约测试：组件级 `requestRender → requestSegmentRender → rerenderSegment → diff → DOM 更新`——✅（环B/环D 测试：signal set → DOM 更新 + 段复用工厂不重跑）
- **W1.3** 修复：✅ **signal 断链（真实 P0 缺陷）**——`ctx.ui.signal()` 原为裸 `createSignal`（无 requestRender 接线）——set 后 DOM 不更新（文档承诺"变化自动重渲染"未兑现）→ env.ts 接线 `subscribe(() => requestRender)`（与 useExternal/useObservable 同模式）——**候选「导航流吞重渲染」「resolvePath 误判」全部证伪**（handler 重跑 + 工厂复用链路完整）
- **W1.4** 应用层对照：Templates 迁移 `useAsyncData`——⏳ 待做（低优先——手写 loadTemplates 可用但 pre-useAsyncData 时代代码）
- **走查疑点定审（重要）**：mockHits=0 根因 = **段复用**（popstate → handler 重跑但**工厂不重跑** → 工厂期 loadTemplates 不再执行）——**不是 handler 未跑**——popstate 实验结论已锁定（契约测试断言 handler 增 + factory 不变）
- **验收**：本波契约测试全绿（6/6——首帧/同URL/环B/环D/batching/query/popstate）——信号修复后 hooks-robust/store/opt-data 回归绿

**W1 新发现（登记——供 W3 参考）**：Templates 手写 `loadTemplates().finally(rerender)` 模式 = 工厂期异步启动——段复用后工厂不重跑 → 数据永不刷新（除非导航）——**应用层迁移 useAsyncData 是正解**（模块级注册表 + reload 显式刷新语义）

### W2 api 中间件流化（P1——Observable 优势：单飞/取消/回放）

**场景证据**：G13 竞态是 Promise 链表达不了重试时序的真 bug——VDOM-OBSERVABLE-OPTIMIZE
判负记录「api 中间件 Promise 无增益」被实证推翻——**修订判负**。

- **W2.1** `refresh$`：401 事件 → `exhaustMap(doRefresh)`——**exhaustMap 内建 single-flight**
  （刷新中后续 401 等待同一流——替代 G13 快照 hack）；refreshToken 旋转失败 → error 显式化
- **W2.2** 请求管线：`fromPromise(fetch) → 401 → waitFor(refresh$ 一次) → retry take(1)`
  ——重试上限语义流化表达（不再手写 `_retried` 标志）
- **W2.3** `token$`（BehaviorSubject）接线 auth 中间件已有 `token$`（登录/刷新/登出单源）——
  请求头从 token$ 派生（`distinctUntilChanged` 避免重复设头）
- **W2.4** 回放测试：401→refresh 成功→重试 200 / 401→refresh 失败→ApiError /
  并发 401×N→刷新恰 1 次 三序列**记录重喂同决策**
- **约束**：ApiClient 公开形状不变（get/post/token/onUnauthorized 兼容）——消费端零改动
- **验收**：G13 既有契约保持绿 + 新增并发矩阵全绿

### W3 hooks 时序源统一（P2——健壮性——环境降级单轨）

- **W3.1** 审计全部时序源：rAF（useTween）/setInterval（StatCard countdown、
  popup poll）/setTimeout（scheduleAfterRender 兜底、notification）——登记表（hook × 源 × 停摆行为）
- **W3.2** 统一降级纪律：**时序源不可用/停摆 → 直落终值 + 一次兜底渲染**（G14 stall
  兜底模式泛化）——机制单轨（一个 `envStallGuard` 工具，非每 hook 手写）
- **W3.3** useTween 内部流化评估：`animate$ = target → rAF 流（takeUntil 完成/卸载）`
  ——**仅当 W1 证明组件级重渲染链路可靠且动画帧能落地**（否则直落保持，动画判负留档）
- **验收**：无头环境 hooks 矩阵契约（无 rAF / rAF 不 fire / 后台节流三形态 → 全部终值正确）

### W4 调度器诊断增强（P3——可观测——低优先）

- **W4.1** `sched:request` spy 事件补来源 tag（navigate/component-rerender/timer）
  → 渲染健康频率轴可**归因**（哪类源风暴）
- **W4.2** 回放测试补来源维度（时间线重喂同 flush 序列——含来源）
- **验收**：渲染健康 snapshot 增量字段 + 回放绿（现有测试不破）

### W5 防线固化 + 文档（随波次即时）

- 每波契约测试即时落（不攒批）
- AGENTS.md 修订：VDOM-OBSERVABLE-OPTIMIZE 判负记录更新（api 流化判负撤销——G13 实证）
- 全量回归收口（框架契约 + agent-platform UI 套件 + 双侧 tsc）

---

## 三、判负预登记（不做的事）

| 不做 | 理由 |
|---|---|
| 路由层全流化（resolveFlow 已是流——不再包仪式流） | 已单轨；W1 只修实证断点 |
| 组件级精准渲染全面铺开 | requestRender 当前页面级语义稳定——无场景证据前不动（env.ts 注释的"后续优化"维持登记） |
| 装饰动画流化建复杂管线 | 若 W1.3 后动画自然工作 → rAF+stall 兜底已够；否则动画判负（直落） |
| scheduler 换实现 | 风暴检测+回放已有——W4 只是加观测维度 |

## 四、风险

1. **W1 定位发现是语义而非 bug** → 分支预案 W1.4（应用层迁移 useAsyncData）为正解——计划已含
2. **W2 动客户端基础设施** → API 形状冻结约束 + 消费端零改动验收
3. **无头环境差异**（rAF/visibility）→ 契约测试用 fake window 精确模拟三形态（正常/不 fire/节流）
4. **agent-platform 偶现复现难** → W1 契约测试以"逐环断言"替代"整场景复现"——环环绿则场景必绿（演绎）

## 五、执行顺序与预计规模

```
W0 基线（0.5d）→ W1 定位+修（1-2d，P0）→ W2 流化（1d，P1）
→ W3 统一降级（0.5-1d，P2）→ W4（0.5d，可选）→ W5 收口
```
