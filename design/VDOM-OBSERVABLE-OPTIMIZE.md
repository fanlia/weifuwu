# VDOM-OBSERVABLE-OPTIMIZE — 让 Observable 优势充分发挥

> **✅ 已完成归档（2027-09）**：6/6 波次交付——波次 1（算子面）
> `9abc86d6` · 波次 2（derived+错误流）`3b94c474` · 波次 3（调度流化）
> `9fd6a975` · 波次 4（高频节流）`a828ec41` · 波次 5（观测面）
> `0a9d531f` · 波次 6（收尾红线）`c7e92a2c`——审计三检查 0 违规 ·
> 351 契约 + 117 场景 + 27 harness + tsc 0 + audit:semantics 0

> 发起动因：VDOM-OBSERVABLE-COMPLETE（9 波次）完成了「接入流世界」——
> 但 Observable 的**优势面**（组合/时间管理/取消/声明式/回放）只兑现了
> 一部分：算子面缺组合与时间算子（operators.ts 注释自认「可后补——场景
> 证据」）、调度器仍是命令式（pending/running 标志 + setTimeout(0) 风暴
> 清零 hack——隐式时序残留）、信号无派生（手写 subscribe+set 双层）、
> useAsyncData 错误不可观测（console.error——诊断无路）。本计划 =
> 从「会流」到「善用流」——每波独立验收可回退。

---

## 0. 完成定义（三检查——波次 6 固化）

1. **组合可用**：多源汇流（combineLatest/merge）+ 时间管理（debounce/
   throttle）+ 有限流（take/finalize）——作者无需手写 setTimeout/双层订阅
2. **时序显式**：调度器无 setTimeout(0) hack——风暴检测进 scan 折叠
   （事件间隔——非计时清零）——审计脚本可检测
3. **失败可观测**：useAsyncData 错误入流——订阅泄漏 dev 检测——
   诊断器扩展读数

## 1. 缺口清单（查证过——2027-09 盘点）

| ID | 缺口 | 证据 | 优势维度 |
| --- | --- | --- | --- |
| G1 | **组合算子缺**：combineLatest/merge/debounceTime/throttleTime/distinctUntilChanged（显式）/finalize/take/startWith | operators.ts 注释「可后补——场景证据」；渲染搜索框防抖需手写 setTimeout | 组合/时间管理 |
| G2 | **useSource 文档-实现偏差**：AGENTS §2b 写了 useObservable/useSource——useSource 不存在 | grep 零命中 | 文档纪律 |
| G3 | **调度器命令式**：pending/running 标志 + setTimeout(0) 风暴清零（隐式时序——同拍 flush 双计竞态隐患）| schedule.ts 全文 | 时序显式/回放 |
| G4 | **渲染节流语义缺**：高激源码（ws/scroll/流式）洪泛——合并「每一帧最新」vs FIFO 队列无选择面 | RENDER-HEALTH 频率轴（>10 渲染/s 破线）| 时间管理 |
| G5 | **信号派生缺**：computed（从信号派生信号——声明式——现在手写 subscribe+set 双层 + 泄漏风险） | store.ts createSignal | 声明式/取消 |
| G6 | **useAsyncData 错误不可观测**：console.error——get() null 混淆 loading/error——作者诊断无路 | env.ts 215 | 失败可观测 |
| G7 | **订阅泄漏无 dev 检测**：destroy$ 单轨已有——卸载后活跃订阅零验证 | v2-lifecycle 无泄漏测试 | 取消验证 |
| G8 | **回放测试未铺开**：absorb/popup 有——cycle/scheduler 无 | 时间线模式未成标准 | 回放 |
| G9 | **性能基线无防线**：Observable 化成本（Subject 广播/算子闭包）无基准上限 | 无 | 成本可见 |

**收益判负（不流化——记录）**：
- DOM 事件桥（fromEventPattern 已存在——事件表命令式是 vdom 事件系统
  本构——流化无增量）
- 中间件请求链（Promise 单值——已判负）
- 调度优先级（nav 优先 vs 数据合并——语义复杂——场景证据不足——后补
  候选）

## 2. 波次计划

### 波次 1：组合算子面补齐（纯新增——零回归风险）

| 算子 | 语义 | 契约要点 |
| --- | --- | --- |
| combineLatest | 多源汇流——**全源首发后才发射**（晚源首值）——快照数组 | 尾部源首值/退订清理/空源完成 |
| merge | 多源合并（同类型） | 交错发射/任源完成即可？——**全完成才完成** |
| debounceTime | 静默期后发射最后值——取消语义（取消防抖） | 连续快速→尾值/完成冲刷/零泄漏 |
| throttleTime | 窗口期首值（leading）——窗口期后尾值（trailing 可选） | leading/trailing 组合 |
| distinctUntilChanged | 相邻去重（默认 === + 比较器） | 相邻语义/自定义比较器 |
| finalize | 流终止（complete/error/退订）清理钩子 | 三路径调用一次 |
| take | 限量发射后 complete+退订 | 源自动退订 |
| startWith | 首值前置（订阅即发射——同步） | 同步发射窗口语义 |

**验收**：observable.test 扩展（~15 契约）· 全量回归 · 纯新增

### 波次 2：数据面——信号派生 + 错误可观测 + 文档校准

1. **derived 派生信号**（`signal` 全链条）：
   `derived(() => [a, b, c], ([x, y, z]) => out)`——**读时计算 + 惰性缓存**
   （上游 set → 标记脏 → 下次 get 重算）——getter 纪律（任意位置读最新）
   ——订阅链零泄漏（上游订阅自动退订——不经组件生命周期——**全局**）
2. **useAsyncData.errors$**（模块级 entry——错误事件流——get() 仍 null
   兼容 + errors$ 订阅可观测——错误历史 + 最新）
3. **AGENTS §2b useSource 校准**（文档反向校准纪律：实现 or 删除——本
   计划实现 combineLatest 后 useObservable 已覆盖「多源汇流」——
   **useSource 删除**——文档-实现偏差歼灭）

**验收**：signal-derived.test（派生/缓存/脏标记/泄漏）· async-errors
契约 · AGENTS 校准 · 全量回归

### 波次 3：调度器流化（管线面——核心）

- `request$` = Subject 源流——**拍合并进 buffer(微任务) 后从 request$
  流消费**——pending/running 标志删除——**storm 检测 scan 折叠**
  （request 事件间隔——无 setTimeout(0) hack——显式时序）
- renders$ 公共面不变（serve/render 零改动——调度器是内部）
- **可回放**：request 时间线 → 重喂 → 同 flush 序列（回放测试）
- 语义保持：渲染中请求排队不丢（FIFO——现有 117 场景是门）

**验收**：scheduler 契约（batching/风暴/顺序/回放）· 场景全量 · 回放
测试（时间线记录→重喂→同 flush 序列）

### 波次 4：高频源节流（频率轴防线深化）

- **渲染请求节流面**：`scheduler.request({ mode: 'latest' | 'queue' })`
  ——latest = 拍内合并丢中间（默认——现状语义）/queue = FIFO 排队
  （不丢——进度类渲染）
- **useObservable 高激源适配**：订阅端节流（ws 洪泛——每帧最多 1 渲染
  ——RENDER-HEALTH 频率轴读数验证）
- 场景：ws 洪泛（100 msg/s——渲染 ≤ 30/s——页面不冻结）+ scroll 节流

**验收**：契约（latest/queue 语义）· 场景（ws-flood/scroll-throttle）·
频率轴读数（诊断器）

### 波次 5：观测面——泄漏检测 + 回放铺开 + 性能基线

1. **订阅泄漏 dev 检测**：渲染周期后活跃订阅审计（destroy$ 后零活跃——
   v2-lifecycle 扩展——泄漏 = 断言失败）
2. **时间线回放标准**：调度流化后——cycle/scheduler 回放测试入列
   （记录→重喂→同终态——absorb/popup 的成熟模式铺开）
3. **性能基线**：10k 节点 build/diff 上限（契约——Observable 化成本防线
   ——流化不拖慢的回归护栏）

**验收**：泄漏测试 · 回放测试 · 性能基线契约 · 全量回归

### 波次 6：收尾红线

1. `scripts/audit-observable-optimize.mjs`——三检查：① 调度器无
   setTimeout(0) 风暴 hack ② 派生信号单实现源 ③ errors$ 可观测——
   违规退出码 1
2. AGENTS.md 校准：§2b（useSource 删除）+ §23 流化维度总表扩展
   （组合算子面/调度流化/派生——完成记录）
3. 完成定义三检查（§0）全过

**验收**：audit 0 · AGENTS 同步 · 全量回归 · 计划归档

## 3. 依赖图

```
波次 1（算子面——纯新增）
  └─ 波次 2（derived 用 combineLatest 语义 + useObservable 校准）
  └─ 波次 4（debounce/throttle 是节流实现基础）
波次 3（调度流化——独立——依赖 1 的 scan 模式已熟）
  └─ 波次 5（回放铺开依赖 3 的可回放性）
波次 6（收尾——全量）
```

## 4. 风险表

| 风险 | 缓解 |
| --- | --- |
| combineLatest 同步首值语义（晚源首值/BehaviorSubject） | 契约锁定精确语义（首发后才发射——与 rx 对齐） |
| 调度流化改变 batching 拍语义 | 117 场景全量是门——拍语义契约先锁 |
| derived 缓存失效（读时计算 vs 主动重算） | 惰性 + 脏标记——契约锁定（重算次数断言） |
| debounce/throttle 取消泄漏 | 契约（零泄漏/退订清 timer——delay 算子先例） |
| 性能基线误报（CI 抖动） | 宽松上限（2x 安全边）——趋势防线非硬门 |

## 5. 验收总表

| 波次 | 状态 | 提交 |
| --- | --- | --- |
| 1 组合算子面 | ✅ 8 算子纯新增（combineLatest/merge/debounce/throttle/distinct/finalize/take/startWith——334 契约） | `9abc86d6` |
| 2 信号派生+错误流+校准 | ✅ derived（读时缓存零订阅）+ asyncErrors$ + **原语信号修复** + useSource 校准——345 契约 | `3b94c474` |
| 3 调度器流化 | ✅ 风暴间隔判定（setTimeout hack 歼灭）+ sched:request 观测点 + 回放测试——338 契约 | `9fd6a975` |
| 4 高频源节流 | ✅ useObservable throttleMs（Subject→throttleTime——算子消费）——347 契约 + 场景 8/8 | `a828ec41` |
| 5 观测面（泄漏/回放/基线） | ✅ instData 清空 + 泄漏防线契约 + 10k 性能基线——350 契约 | `0a9d531f` |
| 6 收尾红线 | ✅ audit 三检查（调度时序/算子面/失败可观测——0 违规）+ AGENTS §23 总表 + 归档——351 契约 + 117 场景 | `c7e92a2c` |

**总验收**：组合面/时序显式/失败可观测三检查 0 违规 · 319+ 契约绿 ·
117+ 场景绿 · tsc 0 · audit:semantics 0 · Observable 化成本合规（性能
基线）· AGENTS 同步
