# VDOM-OBSERVABLE-COMPLETE — vdom 全链路 Observable 化计划

> **✅ 已完成归档（2027-09）**：9/9 波次交付——提交
> `660b44e1`（波次 3）`3812de5a`（波次 4）`d4dfdeeb`（波次 1）\
> `c06e1c22`（波次 2）`942b4e1c`（波次 5）`c5f854af`（波次 6）\
> `72f9b97f`（波次 7）`54d341ab`（波次 8/9）——验收：319 契约 ·
> 27 harness · 117 场景全绿 · tsc 0 · audit:semantics 0 ·
> audit-observable-complete 三检查 0——实施实录见 AGENTS.md
> §23「流化维度总表」。
>
> 发起动因：v2 已把**生成端**（render/diff/调度/值源 hooks/段信号）流化；
> 但**消费端/状态机/外围**仍为命令式 + 状态机——「全 Observable」的承诺
> 只兑现了一半。本计划 = 把剩余部分全部接入流世界——**源/管线/终态/快照**
> 四面完整——每波独立验收可回退。

---

## 0. 完成定义（「所有部分」的精确含义）

五面分类——每个 vdom 组件必须归入其一，且**至少有一个流视图**：

| 面 | 定义 | 形式 |
|---|---|---|
| **源（Source）** | 一切外部事件/值/请求入口 | Observable（浏览器事件、timer、fetch/WS/SSE、导航、命令式 API 调用） |
| **管线（Pipeline）** | 一切变换 | Observable 操作符组合（resolve/render/diff/transform/absorb/清理） |
| **终态（Sink）** | 一切副作用 | 流终结者（DOM apply）——**但副作用可观测**（applied$ 重发射——sink 不是黑洞） |
| **快照（Snapshot）** | 一切状态机 | **双层架构**：内核 = 现有迁移表（穷尽 switch + 显式 Reject——编译期安全**不动**）；外壳 = 事件流 + scan 折叠（状态迁移可观测/可回放） |
| **守卫（Guard）** | 一切防御 | 管线操作符（catchError/窗口检测）——不再是散落 try/catch |

**快照面统一模式（machine$——单一实现源）**：

```ts
type Machine<S, E> = {
  init: S
  reduce: (s: S, e: E) => S        // 穷尽 switch + 显式 Reject（fuzz#79 纪律——
                                     // never 穷尽检查——编译期安全保持）
  legal: (s: S, e: E) => boolean   // 迁移表（state-machine.ts 规格语义不变）
}
const machine$ = (events: Observable<E>, m: Machine<S, E>): Observable<S> =>
  events.pipe(scan(m.reduce, m.init), tap((s) => assertLegal(s, m)))  // 违例 = 流事件
```

- **回放** = `machine$(recordedEvents, m)`——同一个函数重喂记录的流（时间线即日志）
- **违例检测**从「console.error 内联」变「流事件」——测试可断言
- **原则（定稿）**：流化**不增加正确性**（正确性仍由迁移表 + 对账器保证）——流只让
  错误更快现形（时间线/回放/组合/取消）——**状态机内核不删——外壳事件化**

**完成三检查（git grep 红线——波次 9 固化）**：
1. core/ 无「阻塞 await 串联」的渲染周期（唯一保留：消费端 applier 内）
2. 无「双轨清理」（onUnmounts 数组并入 destroy$——onUnmount = destroy$.subscribe）
3. 无「隐式时序」（toast 自动消失/ws 重连/导航守卫全部在流上——timer/event → Observable）

**不改变公共面**：h/jsx/uiServe/UIRouter/openPopup/toast/ctx.render/createSignal
形状不动——流化是内部重构——组件作者零感知。

---

## 1. 现状盘点（缺口清单——五层）

| # | 部分 | 现状 | 缺口 | 流化形态 |
|---|---|---|---|---|
| G1 | **serve 渲染周期**（applyV2Inner） | ✅ renders$ 触发；❌ 周期内部 await 串联 | 核心缺口 | resolve$ → render$ → cmds$ → tap(apply) → applied$ 全管线 |
| G2 | **段生命周期** | ⚪ destroy$ + onUnmounts[] 双轨 | 过渡态 | onUnmounts 并入 destroy$（单信号=全部清理） |
| G3 | **transform 6×6** | ⚪ v1 同步函数 + syncCtx 桥（pendingSink hack） | 桥接层 | 每个 transition 返回 Observable——桥删除 |
| G4 | **SSR 吸收** | ❌ applier 内状态机 | 状态机非流 | absorbReducer = scan 折叠 + failed$ 事件 |
| G5 | **UIRouter** | ❌ resolve 同步 | 命令式 | navigations$ → switchMap(resolve) |
| G6 | **弹窗内核**（popup-manager） | ❌ PopupPhase 状态机 | 状态机非流 | popup$ 事件流 + 内容共享 applyPipe |
| G7 | **toast/confirm/notification** | ⚪ 渲染是流；触发/消失是命令式 setTimeout | 隐式时序 | trigger$/close$ 流 + delay/takeUntil |
| G8 | **中间件**（api/auth/ws/i18n/ai-stream） | ❌ fetch/WebSocket/async gen | 值源未流化 | fromPromise/fromEventPattern/流桥 |
| G9 | **store/createSignal** | ❌ Set 监听器 + getter/setter | 「刻意不流化」断代 | API 不变 + onChange$ 导出（同源 Observable 视图） |
| G10 | **守卫**（R1/R2/effect-guard/async-guard） | ❌ try/catch + monkey-patch | 散落 | catchError 算符 + 窗口操作符（可组合） |
| G11 | **验证面**（Sim/devVerify/auditDom） | ❌ 命令式消费者 | 验证非流 | 订阅 applied$/吸收后快照 |
| G12 | **applier**（processors 330 行） | ❌ 命令式（**合理**） | 副作用终态 | 不动——但经 applyPipe 可观测（G1 覆盖） |

### 状态机流化明细（快照面——评级与决策）

**流化收益三样**：时间线可回放（调试成本——上轮 6 缺陷的 [dbg-*] 考古就是反例）·
纯 reducer 可 fuzz（事件序列级——不依赖树生成器碰运气）· 异步/取消/组合结构性表达
（不再手写 if 嵌套时序）。**不带来**：正确性（迁移表要手写无论如何）·简单性（3 态
布尔机流化=过度设计）·类型安全（reducer 的穷尽要靠 never 检查维护）。

| 状态机 | 流化价值 | 决策 | 形态 |
|---|---|---|---|
| **AbsorbState**（inactive/consuming/failed） | ★★★ | **流化** | scan 折叠——serve 订阅 failed$（替代 apply 循环后查标志轮询——事件驱动） |
| **PopupPhase**（closed/open/exit） | ★★★ | **流化** | exit 退场/防抖 → delay/takeUntil 表达——内容管线已是流 |
| **NodeState**（消费端节点态） | ★★☆ | **流化** | 表已单源——价值=验证面单源（Sim/devVerify/auditDom 共用同一折叠——对账器盲区类问题的结构答案） |
| **ServePhase/RenderPhase**（serve 相位） | ★★☆ | **流化** | 与调度流合并——renders$ 已流化——相位成 scan 折叠——删除手写 renderPhase 变量 |
| **transform 6×6**（转换表） | ★★☆ | **流化** | 转换表 → Observable（波次 3——桥删除） |
| **EventRegistry/RefRegistry/DataPipe**（active/disposed 布尔态） | ☆ | **保持** | 布尔态——流化=过度设计——记录在案（非豁免——是收益判负） |
| **IntervalState**（推导式——slotCount 计算） | ☆ | **保持** | 无运行时状态——无流化对象 |

---

## 2. 波次计划（每波独立验收可回退）

### 波次 1：管线化骨架——渲染周期全管线（G1/G12）
**目标**：applyV2Inner 的 await 串联 → 一条管线；三轴度量在流上取数。

```
navigationsTrigger → resolve$（fromPromise 包装 router.resolve）
  → switchMap → render$（首帧 build / diff / 整树替换——按类型分支）
  → cmds$（Observable<Command>）
  → pipe(cleanupOp)（unmount → disposeSegment——删除 applyV2 尾部循环）
  → tap(applyOp)（命令 → applier.apply——逐条）
  → applied$（应用后命令重发射——dev/度量订阅点）
  → tap(flushAfterRender) → renderComplete$
```

- `resolve$`：Subject（render() 请求 = next——替换 scheduler.renders$ 单点）
- `cmds$`：惰性——订阅才请求（Observable 组合做 backpressure——不 shareReplay 除非有度量订阅）
- **ServePhase/RenderPhase 流化（本波同期）**：renderPhase 变量 → `phase$ = scan(renderPhaseReducer)`——渲染中合并语义 = 流操作符（与 renders$ 同源）——删除手写 if（serv 相位状态机维度总表语义不变）
- 三轴度量（RENDER-HEALTH-PLAN 波次 1 接管）：频率=renderComplete$ 计数、规模=cmds$ 长度、复用=段创建/复用计数——**删除手写 vt.builds/diffs**
- **验收**：契约 264 绿 · navigate/ssr-adopt/unmount 场景绿 · 新契约测试（管线可订阅/cleanupOp 命令级断言/度量三轴正确/相位 scan 折叠正确——渲染中入队/IDLE 迁移）

### 波次 2：段生命周期单轨（G2）
- `onUnmount(fn)` 内部 = `destroy$.subscribe(fn)`——onUnmounts 字段删除
- `disposeSegment` = destroy$.next() 即全部（字段级实现——段接口对外形状不变）
- **验收**：生命周期契约测试（注册顺序/逆序执行/多次 dispose 幂等/订阅者 takeUntil 与函数清理同序）· hooks 全量（popup 关闭清理）场景绿

### 波次 3：transform 表流化（G3——machine$ 统一模式首个落地）
- 每个 transition 函数签名改为 `(oldC, newC, ctx) → Observable<Command>`：
  - 旧侧让位流（removeVNodeTree 已 Observable 化——波次 0 基建）
  - 新侧渲染流（renderV2Node）
  - 组合 = concatObs（转换全程可 tap）
- **删除 transformV2 的 syncCtx/emit/emitNode/pendingSink 桥**（波次 1 的延迟构造 hack 被结构化取代——G1 遗留债偿还）
- 转换表 = Machine<TransformState, Command>——**事件序列级 fuzz 开箱**：随机事件序列
  喂 machine$——迁移合法性穷举（不再依赖树生成器碰运气）
- **验收**：6×6 转换完备性契约测试（重建——原 transform.test.ts 双引擎删除后无单源测试——本波补齐）· 事件序列级 fuzz（状态机本身——多种子）· fuzz 300 组件对绿

### 波次 4：吸收流化（G4——双层架构落地样本）
- `absorbReducer`：`(AbsorbState, Command) → AbsorbState` 纯函数（inactive/consuming/failed 迁移表——状态机维度总表语义不变——**内核不动**）
- applier 内部：`cmds$.pipe(scan(absorbReducer))`——吸收状态派生 + **`absorbFailed$` 事件**
- serve：失败回退从「apply 循环后查 `absorb.failed` 标志」改**订阅 failed$**（事件驱动——无轮询）
- **验收**：ssr-adopt 场景绿 · absorb 契约测试（mismatch/failed/next 违例——状态机维度 3 语义保持）· 时间线回放测试（记录 failed 序列 → 重喂 → 同终态）

### 波次 5：路由流化（G5）
- 导航源：link 拦截事件/popstate/replaceState → `navigations$`（Subject + fromEventPattern）
- `route$ = navigations$ → switchMap(resolve)`——redirect 循环流化（`while` 改 `expand`/递归流）
- ctx.params/query/route 注入保持（resolve 内——不变）
- **验收**：navigate 场景绿 · 路由契约（链接拦截/popstate/redirect/守卫链——G9 重写流形态）

### 波次 6：弹窗与命令式 API 流化（G6/G7）
- popup-manager：`openPopup(opts) → PopupHandle` 不变——内部新增 **`events$`（PopupPhase machine$——closed/open/exit 迁移为 scan 折叠）**——exit 退场防抖 = delay/takeUntil 表达——内容渲染 = 独立 applyPipe 实例（波次 1 共享）
- toast/confirm/notification：触发 Subject（`toast$`）——自动消失 = `delay(duration)` + `takeUntil(close$)`——定时器在流上
- **验收**：popup 场景矩阵绿 · toast 契约（自动消失/confirm resolve/notification——BUG#3 回归）· popup 时间线回放（open→close→exit 序列回放——presence 退场等价）

### 波次 7：中间件值源流化（G8/G9）
- api：`fetch → fromPromise`（AbortController → error 通道）
- ws：`WebSocket → Observable`（open/message/close/error + 重连策略流——scan 折叠计数）
- auth：`token$`（BehaviorSubject——login/logout 事件统一——中间件读写同源）
- i18n：`locale$`（Subject——setLocale = next——**无自动渲染纪律保持**）
- ai-stream：SSE → 流桥（fromEventPattern/ReadableStream 适配器——async generator 保留为内部适配）
- store/createSignal：API 不变 + `onChange$` / `asObservable()` 导出（值源流视图——可 pipe/takeUntil）
- **验收**：api/auth/ai-stream 契约（真实 HTTP fixture）· 场景（chat/ws/useExternal）

### 波次 8：验证面收编（G11/G10——NodeState 验证单源）
- Sim：命令流 → 纯函数快照（不变）——但 fuzz 对账器改为吃 `applied$`（应用后状态——含吸收）——**对账维度升级：全量 vs 增量 + 应用后 vs 命令前**
- devVerify：订阅 applied$（Post 断言——不再依赖 apply 循环内检查）
- **NodeState 单源折叠**：Sim/devVerify/auditDom 消费**同一条** `cmds$ → scan(nodeMachine)` 折叠（消除三份实现——对账器结构性盲区（两世界同错=等价）的结构答案）
- 守卫操作符化：R1（catchError + 计数操作符——错误风暴防护）· R2（renderFn 窗口 catch——hole 降级为管线算子）· effect-guard/async-guard（窗口检测算子——warn 事件进 stream：`warn$`）
- **验收**：全量回归（契约 264+ / 场景 116 / showcase 200）· audit:semantics 0 · NodeState 单源对账（三面同流——fuzz 多种子）

### 波次 9：收尾红线（完成三检查固化）
- audit 脚本：`scripts/audit-observable-complete.mjs`——grep 红线（await 串联周期/onUnmounts 字段/setTimeout 隐式时序——域限定 core/ 与 hooks/——豁免清单=0）
- AGENTS.md 更新：状态机维度总表 → 流维度总表（快照/管线/终态）——架构知识同步
- VDOM-OBSERVABLE-COMPLETE 完成定义验收（三检查全过）· 性能基线（契约层 ~2s 内——流化不回退）

---

## 3. 依赖图与里程碑

```
波次 1（骨架——一切挂它）
  ├─ 波次 3（transform——删除桥接——依赖 1 的管线）
  ├─ 波次 4（absorb——依赖 1 的 cmds$）
  ├─ 波次 5（路由——依赖 1 的 resolve$）
  └─ 波次 6（弹窗——依赖 1 的 applyPipe 共享）
波次 2（生命周期单轨——独立可前置）
波次 7（中间件值源——独立）
波次 8（验证面——依赖 1-7 全量）
波次 9（收尾——全量验收）
```

**每波验收门**：契约全绿 + 该波专项测试绿 + fuzz（1200+300）绿 + tsc 0 +
audit:semantics 0 —— 任一不绿不回退。总预估 6-8 周（参考 V2-BLUEPRINT 节奏）。

---

## 4. 风险与代价（诚实裁剪）

| 风险 | 对策 |
|---|---|
| **性能**：管线化 + applied$ 重发射的订阅开销（大列表/1200 租户页） | applied$ 默认单订阅零缓冲（无度量订阅即零额外成本）——shareReplay 仅在 dev/度量分支；性能基准每波记录（契约层耗时基线） |
| **复杂度**：管道组合可读性 vs 显式状态机可验证性 | 状态机面不删除——迁移为**纯 reducer**（scan 折叠）——可验证性保留（对账器/状态机维度总表语义不变）——流是时序表达，状态机是状态表达——共存=每机制单轨 |
| **类型穷尽弱化**（reducer 的 (S,E)→S 落空分支变运行时问题） | machine$ 纪律：reduce 内**保留 never 穷尽检查**（每个 switch 分支显式 return——违规即编译错）+ assertLegal 流事件（运行时违例显式化——fuzz#79 纪律的流形态） |
| **SSR 端差异**：node 无 DOM——applier 不参与 | 管线在 node 侧 = resolve$ → cmds$ → encode（无 apply 段）——同一管线不同终态（架构处理干净——也是本计划的增值点） |
| **工作量**：9 波次 | 每波小步验收可回退（git 历史）——弹性裁剪点=波次 4/7（若收益证据不足——记录豁免——守则 5 要求零豁免——故裁剪需用户决策） |
| **双轨清理期间的风险窗口**（波次 2 前） | 波次 2 前置优先（波次 1 与 2 无依赖——建议 2 先行） |

---

## 5. 验收总表（完成定义对账）

| 波次 | 任务 | 验收 | 状态 |
|---|---|---|---|
| 1 | 渲染周期管线化 + ServePhase/RenderPhase 折叠 | 契约 264 · 场景关键 · 度量流测试 · 相位 scan 测试 | ✅ 2027-09——v2/cycle.ts（管线：build/diff → toArray 原子性 → tap(apply) → tap(cleanup) → applied$/complete$——依赖注入可契约直测）+ serve 改造（applyV2Inner 删除——cycle 承载）+ RenderPhase scan 折叠 + 算子 tap/toArray + pipe 5 算子重载 + v2-cycle 契约 7 + observable 算子 4——275 契约/27 harness/tsc/audit/e2e（含 R1 熔断）全绿 |
| 2 | 生命周期单轨 | 生命周期契约 · popup 场景 | ✅ 2027-09——onUnmounts 字段删除——闭包栈 + destroy$ 单订阅者（LIFO 保持）；v2-lifecycle/v2-hooks 再校准；264 契约 + 27 harness + tsc + audit 全绿；`__DBG8/4/5` 残留清除 |
| 3 | transform 流化（machine$ 首次落地） | 6×6 契约 · 事件序列 fuzz · fuzz 300 | ✅ 2027-09——emitNode 记录语义（不构造）+ 三段 concatObs（disposeOp → removeCmds → 新侧渲染·订阅时构造）——pendingSink 时序 hack 删除；C1 回归测试（同 compId 段不复用——工厂正确新建）；288 契约全绿（含 fuzz 对账等价） |
| 4 | 吸收 scan 折叠（双层架构样本） | ssr-adopt · absorb 契约 · 回放测试 | ✅ 2027-09——absorbReducer 纯函数 + events$ scan 单源 + failed$ 事件；**回退闭环补全（现状缺口——failed 标志无人消费）**；absorb 契约 12（含时间线回放）+ 场景 ssr-mismatch 7/7——287 契约/117 场景全绿 |
| 5 | 路由流化 | navigate 场景 · 路由契约 | ✅ 2027-09——resolvePath 统一入口（link/popstate/navigate/boot）+ navigations$ 观测面（nav:resolve）；redirect while → 递归流（switchMap 取消——上限 5）；丢弃守卫删除（取消替代——最后一站胜）；req 变量删除；R3 redirect 场景 1/1 + navigate 场景绿——117 场景全绿 |
| 6 | 弹窗/命令式 API 流化（PopupPhase 折叠 + 回放） | popup 矩阵 · toast 契约 · 回放等价 | ✅ 2027-09——PopupEvent + popupPhaseReducer + events$ 单源（手写 phase 删除）+ handle.events$ 公开；toast 定时器上流（create+delay——setTimeout 裸调用删除）；delay 算子 4 语义契约；popup-phase 6 + observable +4——298 契约/场景（toast·confirm·popup 矩阵）全绿 |
| 7 | 中间件值源流化 | api/auth/ai-stream 契约 · chat/ws 场景 | ✅ 2027-09——store/chat changes$ + ws messages$/status$ + auth token$ + i18n locale$（同源视图——API 不变纯扩展）；**api 收益判负**（Promise 单值源）——306 契约全绿 |
| 8 | 验证面收编（NodeState 单源折叠 + 守卫算子化） | 全量回归 · audit 0 · 单源对账 | ✅ 2027-09——**审计定论**：NodeState 规格已单源（state-machine.ts tracker——Sim/devVerify 共用）——逐命令 transition 时机正确（单步定位——周期级流化无增量）；守卫已机制化（catch/熔断/窗口检测在管线内）；isConnected 已是应用后断言 |
| 9 | 收尾红线 | 三检查 · 性能基线 · machine$ 纪律审计 | ✅ 2027-09——audit-observable-complete.mjs（渲染周期管线化/单轨清理/无隐式时序——域限定 core/+hooks/——豁免清单登记制）；AGENTS.md 流化维度总表同步；三检查零违规 |
