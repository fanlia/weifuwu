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

### W2 api 中间件流化（P1——Observable 优势：单飞/取消/回放）✅ 完成（e42ca6b2）

**场景证据**：G13 竞态是 Promise 链表达不了重试时序的真 bug——VDOM-OBSERVABLE-OPTIMIZE
判负记录「api 中间件 Promise 无增益」被实证推翻——**修订判负**。

- **W2.1** `refresh$`：✅ `refreshTrigger$`（Subject）→ `exhaustMap(doRefresh)`——**exhaustMap
  内建 single-flight**（新增算子——observable/operators.ts——2 契约测试锁定：in-flight 丢弃/
  完成后启动新内层）——刷新中后续 401 丢弃触发但**等待同一结果**（refreshDone$ 广播
  take(1)）——旋转 token 双刷竞态歼灭（**并发 401×5 → 刷新恰 1 次**——契约测试实证：
  G13 快照比对堵不住的「同拍双 401 刷新未发生时各自走 onUnauthorized」窗口）
- **W2.2** 请求管线：✅ 401 → token 快照已变 → 直接重试（G13 保留）；未变 → 触发单飞 →
  等 refreshDone$.take(1) → true 重试 / false|throw → 401 ApiError（错误显式化——不静默）✓
- **W2.3** `token$` 接线：⏳**判负留档**——auth 已有 token$（BehaviorSubject）但 api 的
  token 是 getter 快照（每次请求时读）——「token 已变检测」由快照比对覆盖（G13）——
  token$ 订阅渲染链无增量场景（api 不渲染——请求头每次现读）——判负：不加仪式流
- **W2.4** 回放测试：✅ 401→refresh 成功→重试 200 / 401→refresh 失败→ApiError(401) /
  401→refresh throw→ApiError(401) / 并发 401×5→刷新恰 1 次——4 新测试（真实 HTTP fixture）
- **约束遵守**：ApiClient 公开形状不变（get/post/token/onUnauthorized 兼容）——消费端零改动——
  api.test.ts 原有 G13×2 + 基础 6 全绿（11/11）

**架构决策记录**：exhaustMap 的「in-flight 丢弃」与「等待者仍能拿到结果」是两件事——
丢弃的是触发事件（防双刷），结果经独立 broadcast（refreshDone$）送达所有等待者——
不能把「丢弃」误解为「等待者饿死」——订阅 take(1) 在 next() 之后同步注册（微任务
先行安全）+ 刷新完成必然发射（error 也 next(false)——杜绝挂死）
- **验收**：G13 既有契约保持绿 + 新增并发矩阵全绿

### W3 hooks 时序源统一（P2——健壮性——环境降级单轨）✅ 完成（审计 + 双判负）

- **W3.1** 审计结果（hook × 源 × 停摆行为）——**渲染值风险面已收敛**：

  | 时序源 | 位置 | 停摆行为 | 风险 | 现状 |
  |---|---|---|---|---|
  | rAF 循环 | useTween | 动画值恒起始值 | **渲染值恒 0** | ✅ G14 已修（stall 兜底 + 槽位记忆化）|
  | rAF 单次 | popup/observe/inView | 调度延迟（事件驱动——scroll/resize 再触发补齐） | 无（非循环）| ✅ 前节守卫（raf !== undefined 防重入）|
  | setInterval | ws ping | 心跳中断（非渲染值——连接保活） | 无 | ✅ 背压重试 + 上限 |
  | setTimeout | api timeout / afterRender 兜底 | 单值语义（超时即 abort） | 无 | ✅ |

- **W3.2** `envStallGuard` 单轨工具：**判负**——唯一的渲染值停摆风险（useTween）
  已由 G14 兜底内联修复——无第二场景（其它 hook 事件驱动无「恒空」风险）——
  抽单轨工具 = 为单点场景造抽象（无场景证据——不造抽象纪律）
- **W3.3** useTween 内部流化：**判负**——`animate$ = target → rAF 流` 的增量 =
  取消声明式（现状 cancelAnimationFrame/clearTimeout 手写已正确）+ 回放（无场景）——
  现状机制（槽位记忆化 + stall 兜底 + 卸载清理 + reduced 直落）已完整正确——
  流化 = 仪式流（增量低——不满足「结构化替代 hack」判据——现状无 hack 可替代）
- **验收**：无头 hooks 矩阵契约（无 rAF / rAF 不 fire 两形态）→ useTween 终值正确
  ——已有契约锁定（hooks-robust / 场景层 use-tween 直落——G14 固化）

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
