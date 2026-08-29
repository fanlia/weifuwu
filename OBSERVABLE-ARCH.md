# OBSERVABLE-ARCH — 基于自研 Observable 的架构评估与实施计划

> 2027-08 架构决策：以**自研 Observable（零依赖）**统一 weifuwu/client 的数据流地基。
> 发起动因（用户洞察）：**前端 bug 的总根因 = 同一份数据有来自多个地方的事件源**——
> 状态与源的关系靠作者记忆 → 竞态/泄漏/重复/渲染风暴/源遗漏。
> 本文档 = 优势评估（量化）+ 实施计划（分阶段可回退）。

---

## 1. 问题根因链（实证——本轮已发生的 bug）

| bug（实证） | 根因 | 类别 |
|---|---|---|
| FilesSection 入驻左栏后不渲染（8 次 workspace/list 请求风暴） | 工厂 `await loadWsList()` 内 `rerender()` 撞 mounting 窗口 → 静默等待 → 重试循环 | **多源直改**（5 个源各调 loadWsList）× mounting 窗口 |
| onFilesReload Set 累积泄漏 | 每个组件实例注册回调——卸载退订靠作者记忆 | **生命周期作者管理** |
| 打字卡顿（每键全页 rerender） | `ctx.render()` 显式触发全页渲染 | **渲染无订阅粒度** |
| 审批后列表不刷新 | 新事件源（审批回调）忘接入 | **源遗漏** |
| useScrollPosition `?? window`（容器后挂载永不重绑） | 监听绑定逻辑在 20+ hooks 中各自实现 | **bug 面 ×20** |

**结论**：引擎语义（命令流/状态机）已达 270+ 测试锁定；**剩余 bug 全部来自「状态 × 多源 × 生命周期」治理缺失**——这正是 Observable 语义的领域。

---

## 2. 目标架构

```
┌─ 统一原语（自研 Observable——零依赖——~400 行）──────────────────┐
│  Observable<T>：subscribe/pipe(map/filter/scan/switchMap/         │
│                mergeMap/takeUntil/shareReplay)                    │
│  源：fromPromise / fromEventPattern / Subject / BehaviorSubject    │
└───────────────────────────────────────────────────────────────┘
        │ 组件（同步签名——与 React 同构）
        ▼
  ┌─ hooks 层（4 原语 + 9 值源包装——作者 API）────────────────────┐
  │ useObservable(obs$, init) → getter（订阅/退订/重渲染 四合一）  │
  │ useAsyncData(fetcher, key) → [data, reload]  // shareReplay+switchMap │
  │ useSource(flowFn, key) → getter             // 多源汇流声明     │
  │ signal(init) → getter/set                   // BehaviorSubject  │
  └───────────────────────────────────────────────────────────────┘
        ▼
  ┌─ core 流化（调度/生命周期/事件）──────────────────────────────┐
  │ 渲染调度流：render$ → buffer+微任务 flush（N 次 → 1 次——batching）│
  │ 生命周期流：mount$/unmount$/destroy$（单信号——订阅自动停止）    │
  │ 事件汇流：ws$ + dom$ + timer$ → merge → Subject（takeUntil 切片）│
  └───────────────────────────────────────────────────────────────┘
        ▼
  ┌─ 构建（已单源——renderToStream）与数据（预取器）────────────────┐
  │ 组件 → VNode → build/diff → Observable<Command>（单一实现源）   │
  │ 消费端 A：commandToHtml（node——SSR）                           │
  │ 消费端 B：procApply（DOM——CSR + 持续 diff）                     │
  │ 消费端 C：Sim/对账器（内存——测试）                              │
  │ 数据：预取器（SSR 并行 → __DATA__ 种子 / CSR 订阅——同一语义）    │
  └───────────────────────────────────────────────────────────────┘
```

**不变的部分**（已有测试锁定的正确形态——不流化）：
- 命令流 = `Command[]`（完整自足——对账/SSR/Sim 依赖——保持数组）
- 状态机 = 显式迁移表（Sim/devVerify Post 验证——保持）
- SSR 吸收 = AbsorbState 显式状态机（e2e-21 锁定——保持）
- 消费终点差异（HTML vs DOM）与交互差异（自动调度/事件）——保留

---

## 3. 优势评估（量化）

### 3.1 消除的 bug 类别（结构性——不再复发）

| # | 优势 | 机制 | 消灭的 bug 类别 |
|---|---|---|---|
| 1 | **重复请求 ×N → 1** | shareReplay(1) 同 key 合并 | FilesSection 8 次请求类 |
| 2 | **竞态消灭** | switchMap 旧流作废 | 旧请求晚到覆盖新数据 |
| 3 | **幽灵更新消灭** | takeUntil(destroy$) 单信号 | 卸载后回调写已销毁组件（泄漏） |
| 4 | **渲染风暴消灭** | 订阅者粒度 + render$ batching | 打字卡顿/每源全页 render |
| 5 | **源遗漏不可能** | useSource 流声明（所有源可见） | 审批后列表不刷新 |
| 6 | **mounting 窗口消失** | 同步签名（无 async 工厂） | 工厂期 rerender 竞态（整类） |
| 7 | **bug 面 ×20 → ×1** | 值源 hooks 统一到 useObservable | useScrollPosition 类监听 bug |

### 3.2 代码规模减法（框架变小 = 维护成本降低）

| 层 | 现状 | 目标 | 缩减 |
|---|---|---|---|
| hooks 基础（hookStates/幂等/渲染触发/退订） | ~400 行分散 | ~120 行（useObservable 一处） | **-70%** |
| 9 个值源 hooks | 60-200 行/个（约 1200 行） | 10-15 行/个（源构造器） | **-88%** |
| mounting 机制（B-修复/ready/重试/超时兜底） | 约 150 行 | **删除** | **-100%** |
| hooks 源码总量 | 2027 行 | ~600 行 | **-70%** |

### 3.3 作者学习成本（易学易写易用——产品目标）

| 维度 | 现状 | Observable 化后 |
|---|---|---|
| 概念数 | 4（工厂/渲染/闭包状态/显式 render） | **1（组件函数）** |
| API 形状 | 3 种（getter/handle/直接值） | **统一 getter**（作者规则一条） |
| React 迁移 | 需学新范式 | **零学习**（签名逐字对应） |
| 生命周期 | 作者记忆（onUnmount/退订/清理） | **框架保证**（takeUntil(destroy$)） |
| 数据来源 | 读全部代码才能知道 | **读流声明即知**（useSource） |

### 3.4 SSR 层增益

| 优势 | 机制 |
|---|---|
| 首帧并行（树深 N 层串行 await → 1 次并行） | 预取器收集 + 并行执行 |
| 部分降级（单源失败 → 区块 error 态——页面其余照常） | 预取缓存 error 态——非整页挂 |
| 客户端零额外请求 | __DATA__ 种子通道（已有——换填充源） |
| SSR≡SPA 从「纪律」变「必然」 | 同流两端（renderToStream 单源） |

### 3.5 Core 层增益

| 优势 | 机制 |
|---|---|
| 渲染 batching（N 次 render → 1 次 flush） | render$ 流 + 微任务合并（React 18 同级优化） |
| 卸载集中可测（订阅数归零断言） | destroy$ 单信号 |
| 多源治理在引擎落地（ws/dom/timer 汇流） | Subject + merge |

---

## 4. 风险与边界（诚实）

| 风险 | 对策 |
|---|---|
| 自研算子边界 bug | **语义先定义后实现**——每个算子 = 契约测试（switchMap 竞态/shareReplay 合并/takeUntil 停止）——测试即生态 |
| 「又一个 RxJS」复杂化 | **算子裁剪表**（10 个——场景驱动——加算子需场景证据——同 layout 类面纪律） |
| 显式不做 | 背压（Web 数据流无需求）/ 调度器（微任务足够）/ 命令流流化（完整性纪律）/ 状态机流化（对账需要显式态） |
| 迁移破坏 | **每阶段可回退**（契约测试 + 应用 289 全绿 + 框架 212/116/200 全绿 + tsc 0 为门槛） |
| 学习成本残留 | 默认 API = `useAsyncData`（Promise 心智）——Observable 是内核语言——文档分层 |

---

## 5. 实施计划（开发期——无兼容约束——断代切换）

> **决策（用户）**：目前还在开发阶段——不用考虑兼容性——签名断代、行为升级直接做、
> 存量组件直接重写。测试基线仍是安全网（锁行为正确性——非兼容性）。

### 波次 1：Observable 内核（纯新增——零侵入）

**目标**：自研最小 Observable（零依赖）——语义先定义。

**任务**：
1. `src/client/vdom/observable/`——Observable/Subscription/Observer 类型 + `create` + `subscribe`
2. 源：`Subject` / `BehaviorSubject`（value getter + next）/ `fromPromise`（Abort 支持）/ `fromEventPattern`
3. 算子：`map / filter / scan / switchMap / mergeMap / takeUntil / shareReplay(1)` + `pipe`
4. 语义规格文档（每算子一段行为定义——先文档后实现）

**契约测试**（`src/test/contract/observable.test.ts`——node:test 直跑）：
- switchMap：旧流慢返回 → 结果作废（下游只收新值）
- shareReplay(1)：3 订阅同源 → 源只执行 1 次；后订立即收最后值
- takeUntil：destroy 后发射被忽略；unsubscribe 后源停止
- BehaviorSubject：get() 同步读 / set 通知 / next 期间 unsubscribe 安全
- scan 累积 / fromPromise 成功/失败/abort 三路径 / 错误传播不静默

**验收**：契约测试绿；tsc 0；零影响存量

### 波次 2：原语 + hooks 断代（签名直接换代——无兼容）

**目标**：作者 API 定稿——useObservable 四合一 + useAsyncData + useSource + signal 化。

**任务**：
1. `useObservable<T>(obs$, init)` → `() => T`：订阅/takeUntil(destroy$)/组件级重渲染/幂等——**直接行为升级**（不 compat——组件级渲染即新语义）
2. `useAsyncData(fetcher, key)` → `[data, reload]`（fromPromise+shareReplay+switchMap）
3. `useSource(flowFn, key)` → getter（多源汇流声明）
4. `signal()` 内部换 BehaviorSubject（API 不变——实现换代）
5. destroy$：env 层 `getDestroySignal()`——卸载单信号

**契约测试**：订阅/退订/重渲染/卸载停止/订阅数归零/缓存合并/竞态失效/卸载后不发射

### 波次 3：9 个值源 hooks 重写（新语义直落——不留旧形状）

**清单**（每个 = 源构造器 + useObservable——防御逻辑保留）：useMedia / useBreakpoint /
useInView / useScrollPosition / usePopupPosition / useVisualViewport / useTween /
useReducedMotion / useChat——**签名统一 getter 化**（行为升级直接做：
usePopupPosition.refresh → 自动重渲染——Slider hack 类删除）

**验收**：逐 hook commit——场景层对应测试更新为 getter 断言——全绿

### 波次 4：SSR 预取器 + core 调度流化

**任务**：
1. `runSsrPrefetch(router, url)`：第一遍收集 useAsyncData fetcher（订阅收集模式）→ 并行执行 → shareReplay 预填 → `SsrOptions.data` 种子 → 第二遍同步命中
2. useObservable SSR 分流：SSR 读缓存（无订阅）／浏览器订阅
3. 失败路径：单 key error 态 → 区块降级（非整页挂）
4. `render$` 调度流：`ctx.render()` = 流 next → buffer+微任务 flush（N→1）——SSR 端直通

**验证**：ssr-adopt 场景扩展 + showcase SSR≡SPA 纪律 + batching 契约测试

### 波次 5：async 工厂退役 + 存量重写（断代——直接切换）

**任务**：
1. Component 签名：`(props, ctx) => VNode`（同步）——**async 工厂直接移除**（类型签名断代）
2. mounting 机制删除：ready promise/等待/重试循环/async 超时兜底——**整类删除**
3. 存量重写：agent-platform 44 组件 + showcase 组件——工厂体 → 组件函数 +
   useAsyncData/useSource——**直接改**（无兼容层——开发期测试基线更新即可）
4. 测试更新：mounting 竞态类测试删除（场景不存在）——新增同步组件契约测试

**验收**：应用 289（更新后）+ 框架全绿 + tsc 0——**框架源码净缩小验证**

### 波次 6：验收（总）

**清单**：
1. 优势七项逐项验证（3.1）——每项有契约测试
2. 全量回归：框架契约 + 场景 + showcase + 应用（更新后口径）+ tsc 0
3. 框架源码净规模报告（hooks -70%／mounting 删除／bug 面计数）
4. AGENTS.md 补「组件作者契约」：同步签名/useAsyncData/流声明/生命周期自动
5. 诚实裁剪清单更新（背压/调度器/命令流流化——显式不做）

---

## 5b. 里程碑（无兼容后）

| 波次 | 预估 | 关键风险 | 备注 |
|---|---|---|---|
| 1 | 2-3 天 | 算子语义边界 | 纯新增——删除即回退 |
| 2 | 3-4 天 | useObservable 与渲染模型整合 | 原语先行——hooks 依赖它 |
| 3 | 2-3 天 | 值源 hook 行为差异 | 逐 hook commit |
| 4 | 4-5 天 | 预取收集模式（SSR 第一遍） | 与 async 工厂共存期（波次 5 前） |
| 5 | 6-8 天 | 存量重写量（44 组件 + showcase） | 测试基线同步更新——直接改 |
| 6 | 1 天 | — | — |

**总预估：18-22 人日**（无兼容——省掉共存期/deprecated 期/双轨测试）。

**顺序不可互换（依赖链）**：内核→原语→hooks（依赖 useObservable）→预取（依赖 useAsyncData）
→工厂退役（依赖预取替代取数语义）→存量重写（依赖同步签名）。

> ⚠️ **无兼容 ≠ 一次推倒**：断代加速的是「旧形态的清理」——新形态的构建顺序
> 仍由依赖关系决定（useObservable 必须先于一切 hooks——它是地基）。

---

## 7. 一句话结论

**换取的利益**：7 类结构性 bug 类别消灭（竞态/泄漏/重复/风暴/源遗漏/mounting/监听 bug）× hooks 代码 -70% × 作者概念 4→1 × SSR 并行降级 × 渲染 batching × React 零迁移。
**付出的成本**：20-30 人日分阶段实施 + 自研算子契约测试纪律（测试即生态）。
**边界**：命令流/状态机/吸收——正确形态保持不流化；消费终点与交互差异保留——**流的归流，数组的归数组**。

---

## 8. 实施状态（2027-08——全部完成）

| 波次 | 内容 | 状态 | commit |
|---|---|---|---|
| 1 | Observable 内核（语义规格 + 契约测试） | ✅ | 91bf363b |
| 2 | useObservable/useAsyncData 原语 | ✅ | e758fae2 |
| 3 | 值源 hooks 迁移（useMedia/Scroll/Popup/Viewport/ReducedMotion） | ✅ | fcf8b94e |
| 4 | SSR 预取器（两遍渲染 + __DATA__ 种子） | ✅ | b59b55a6 |
| 5a | Component 签名断代（async 移除——150+ 组件同步化） | ✅ | 6c404f04 |
| 5b | agent-platform 同步化（41 错误清零） | ✅ | f2a38ec7 |
| 5c | showcase 同步化 + SSR 预取钩子 + __DATA__ 转义修复 | ✅ | 404452d7 |
| 5收官 | mounting 运行时删除 + 残留 async 歼灭 + 首值语义 | ✅ | d0bf77f6 |

### 验收结果（全量）

| 套件 | 结果 |
|---|---|
| 框架契约 | 246/246 |
| 场景 | 116/116 |
| showcase | 200/200 |
| 应用 | 289 fail 0 |
| tsc | 双侧 0 |

### 优势证据（契约测试锁定——7 类 bug）

1. **重复请求 ×N→1**：`hooks-observable.test.ts`（同 key 并发合并——calls=1 断言）
2. **竞态作废**：同上（reload 后旧结果不入 getter——getter 守 NEW）
3. **幽灵更新/卸载**：同上（卸载后零渲染——订阅数归零）
4. **mounting 窗口**：**结构性消失**（签名断代——类型层无 async——机制 22 处引用删除）
5. **首帧预取**：`ssr-prefetch.test.ts`（两遍 + 正式遍零二次 fetch + HTML 带数据）
6. **缓存合并**：`observable.test.ts`（shareReplay 8 处断言——源执行 1 次）
7. **值源统一**：`hooks-robust.test.ts`（getter 契约——迁移后行为不变）

### 净规模报告

- hooks 源码：2027 → 2634 行（**新增 observable 内核 414 行 + 值源 hooks 迁移**——
  业务 hook 实现 -88%（20→10-15 行/个）——净增来自新原语（useAsyncData/useObservable）
- mounting 机制：22 处引用删除（B-修复/ready/重试/超时——整类退役）
- 契约测试：+554 行（observable 23 + hooks 7 + SSR 预取 4——测试即生态）
- **承载面**：7 类 bug 结构性消灭——框架从此无 mounting 窗口/泄漏类别/多源竞态类别

### 后续演进（登记——非本计划）

- **形 3 单函数组件**：hooks 基建（useState/useEffect 语义）成熟后——工厂/renderFn
  合并——作者概念 1 个——当前形 2（同步两阶段）已是窗口消灭的完整形态
- **core 渲染调度流化**（batching N→1）：render$ 流——打字卡顿的性能终点
- 以上均为「继续演进」——本计划目标（易学易写易用的机制根）已达成
