# vdom 优化计划（v3）
> **状态（2026-12 确认）**：✅ 已完成——vdom 优化 v3（批量 + 缓存）

> 状态：**已实施闭环（2026-08）**· v2 已闭环（P-1~P-6 + S-1 定论 + 文档引导）· v3 全部完成
> 实施：0c84a59d（阶段 0 基准）· 041778e6（V3-1 文本复用）· d8aec9f9（V3-2 build 同步快路径）·
> 002971b0（V3-3 引用短路）· 2f769705（文档同步）
> 来源：v2 闭环后对 1000 行 keyed 列表场景的**热点量化**（probe 实测，非推断）
> 目标：在不改变 render-only 心智与「剪枝 + 三态 skip」架构的前提下，消除已量化热点。
> **前提约束**：v2 的 P-1~P-6 全部保留；v3 只做「收益可量化 + 风险可控」的引擎优化，
> 不做架构重构（事件委托 / keyed 增量定位——见 §3 明确不做）。

---

## 0. 背景：v2 闭环后的性能现状

```
ctx.ui.render() / useExternal / 导航
  → renderOne(id)              同 id 进行中合并
    → await vnode._render()    ① renderFn 重跑（强制异步）
    → await buildVNode()       ② async 预构建（P-1 剪枝命中 = 同步 O(1)）
    → patchValue()             ③ 同步 diff（P-2 三态 skip / P-3 patchProps 快路径 / P-4 单次插入）
```

v2 已优化点：P-1 剪枝快路径（组件剪枝命中零 await 零 childCtx）· P-2 diff 信任 buildVNode
（引用比较替代 props/版本双比较）· P-3 patchProps 引用级快速路径 · P-4 keyed 单次插入 ·
P-5 normalizeChildren 统一 · P-6 SSR 并行取数。

### 0.1 热点量化（probe 实测——1000 行 keyed 列表，jsdom）

| 环节 | 现状耗时 | 瓶颈分析 |
|---|---|---|
| build 首帧 | 11.7ms | **async 函数微任务开销**——每子项 1+ 微任务（1000 行 × 每行 3 元素 = 3000+ 微任务）；剪枝命中路径虽同步返回但 async 调用本身产生微任务 |
| render 首帧 | 37.9ms | DOM 创建——**合理大头**（1000 元素 + 文本节点） |
| build 更新（native 树） | 13.4ms | native 无剪枝（组件树剪枝命中仅 2.2ms——**组件剪枝有效**） |
| patch 更新（native 树） | 31-41ms | 深层树全量遍历（每行 3 元素 × 1000 行 = 5000+ patchValue/patchProps 调用） |
| **文本节点更新** | replaceChild 44.85ms/万次 | **nodeValue 直改仅 6.2ms/万次——7 倍差距**（patchValue 字符串分支当前 createTextNode + replaceChild 双 DOM 操作） |

**结论**：v3 的三个量化热点 = ① 文本节点更新方式（7 倍差距，低风险）② build async
微任务开销（可消除，中风险）③ patch 深层树遍历常数（引用短路可削减，低风险）。

---

## 1. 问题清单（v3 新增）

### V3-1：文本节点更新用 replaceChild（实测 7 倍差距）

`patchValue` 字符串分支：`String(oldInput) !== String(newInput)` → createTextNode +
replaceChild（2 次 DOM 节点操作）。**旧文本节点可直接复用**：`nodeValue = String(newInput)`
（1 次属性写，零节点操作——实测 44.85ms → 6.2ms/万次）。

- 首帧/新增仍 createTextNode（无旧节点可复用）——仅更新路径复用
- 副作用：`_refNode` 引用不变（旧节点未替换——更稳定，diff 锚点不漂移）

### V3-2：build 同步快路径（消除 async 微任务）

> **红线声明（用户确认）**：**组件两阶段定义必须是异步的——`Component<P, C> =
> async (initProps, ctx) => (props) => Promise<VNode | null>` 零改动。**
> V3-2 只改**引擎内部树遍历函数** `buildVNode`（非组件 API）——组件 factory/renderFn
> 仍被 `await`（renderFn 强制异步契约不变）；异步心智不变（`await render()` = DOM 同步）。
> buildVNode 非 async 仅让「无需 await 的路径」（剪枝复用/文本/null）不产生微任务——
> 引擎实现细节，与组件定义无关。

`buildVNode` 是 async 函数——**每个子项调用即返回 Promise（函数体在微任务执行）**——
数组分支 `input.map(c => buildVNode(c, ...))` 对 1000 子项产生 1000+ 微任务（即使剪枝
命中同步返回）。改非 async：`VNodeChild | Promise<VNodeChild>`——

- 剪枝命中 / 文本 / null / 已构建子树 → **同步返回值**（零微任务）
- 数组分支：`Promise.all(input.map(...))` 内同步值立即 resolve（微任务 1000+ → ~1）
- 调用方统一 `await` 吸收（同步值 await 仅 1 微任务）
- **组件路径零影响**：组件 vnode 分支仍 `await vnode._render!(props)`（renderFn 强制
  异步——异步契约原样）；仅非组件路径（native/文本/剪枝复用）同步返回
- 类型：`buildVNode` 返回类型改联合；调用点（mountRoot/rerender/doRender/mountCommand）
  已全 await——零调用点改动语义

### V3-3：patchChildren 引用短路 + 顺手微优化

**3a 引用短路**：allUnkeyed 分支 `newC === oldC`（vnode 引用相等）→ `out.push(oldNodes[i]);
continue`——**引用相等 = 子树未变**（JS 对象不可变约定）——跳过 patchValue 全递归。
命中场景：renderFn 返回稳定数组引用（`props.items` 原样透传——常见）；build 组件剪枝
复用旧 `_child` 后（组件 vnode 新但 `_child` 旧——组件 skip 已覆盖，native 引用短路
补足原生项）。

**3b normalizeChildren 零拷贝**：已扁平数组（无嵌套数组项）直接返回原引用——
patchChildren 每调用省 2 次数组重建 + 栈展开（probe：1000 项 × 50 次仅 0.33ms——
收益小但顺手，patchChildren 每次调用都跑）。

**3c 组件 skip 前置**：patchValue 组件分支——id 传递/registry 注册前先做三态 skip
判断（skip 时省 registry 写——当前 skip 判断在 id 传递之后）。

---

## 2. 优化计划（分阶段，每阶段验证标准）

| 阶段 | 项 | 收益 | 风险 | 验证 |
|---|---|---|---|---|
| 0 | 基准固化 | — | — | 新增 probe 测试（1000 行场景分解 build/render/patch 耗时 + DOM 写）固化到 render-perf.test.ts |
| 1 | V3-1 文本节点复用 | 文本更新 DOM 操作减半（7 倍实测） | 低 | 全量测试 + DOM 写计数不增 + 文本更新单测 |
| 2 | V3-2 build 同步快路径 | build 剪枝 13.4 → 2-3ms（native）/ 2.2 → ~1ms（组件） | 中（类型 + 4 调用点） | tsc 0 + 全量测试 + build 耗时对比 |
| 3 | V3-3 引用短路 + 零拷贝 + skip 前置 | patch 未变项零递归 | 低 | 全量测试 + 引用短路单测（稳定数组透传场景） |
| 4 | 文档同步 | 应用层剪枝命中率 | — | docs/frontend.md 列表性能小节 |

每阶段独立提交（一个 commit，语义零变化 + 测试守护）——对齐 v2 纪律。

---

## 3. 明确不做（及原因）

- **事件委托**（React 17 模式）：1000 行 × 2 事件 = 2000 listener——listener 注册本身
  便宜（probe 噪声无法量化收益）；委托改变事件语义（stopPropagation/捕获/removeEventListener
  行为）——高语义风险换低收益。**不做**。
- **keyed 增量定位**（持久化 oldKeyMap + 只 diff 变化 key）：**无法解决架构性成本**——
  Table 整表 renderFn 重跑必然重建全部行 vnode（native tr 每次新引用）——增量定位仍需
  全量比较新旧。**单行编辑的正解是行组件化（剪枝生效）或行级状态管理**——S-1 文档引导
  方向（列表行用组件包裹——组件剪枝实测 2.2ms vs native 13.4ms——6 倍差距）。
- **patchProps 值比较降级**：P-3 快速路径已覆盖引用全等；值比较是正确性要求
  （props 值变必须 DOM 写）——剩余遍历是必然成本。
- **SSR 字符串缓冲**：V8 引擎 += 已优化；P-6 并行已落地——无剩余热点。

---

## 4. 纪律提醒（执行时注意）

- **架构红线**：组件两阶段异步定义（`Component<P, C> = async (initProps, ctx) =>
  (props) => Promise<VNode | null>`）**不可改动**——V3-2 只改引擎内部 buildVNode
  （非组件 API），组件 factory/renderFn 仍 await；任何改动不得让同步组件合法化
  （diff 遇未构建组件仍 throw）
- 每项独立提交 + 全量测试守护（v2 已验证 1354+ 测试可靠）
- V3-1 的 DOM 写计数：nodeValue 赋值不计入 Node.prototype 方法计数——render-perf 的
  「更新单行 DOM 写 ≈ 1」断言需确认语义（0 或 1 均正确——1 次属性写）
- V3-2 类型改动：buildVNode 返回联合类型——`await` 在 4 个调用点已存在（零调用点改动）；
  注意 `vnode._child = built ?? null` 处 built 可能是同步值（await 后统一为值）
- V3-3 引用短路：**只对原生 vnode 项生效**（组件项引用相等 = 新 vnode 未构建——必须走
  patchValue 组件分支 skip）；短路条件是 `newC === oldC` 且两者均为对象 vnode
- 阶段 0 的 probe 测试是**基准固化**（不断言死值——相对基线比例断言，对齐 v2 阶段 0）

---

## 5. 预期收益汇总（对照 v2 基准）

| 指标 | v2 基线 | **v3 实测** | 来源 |
|---|---|---|---|
| build 更新（native 1000 行剪枝） | 13.4ms | **0.42ms（27x）** | V3-2 |
| 首帧 build | 6.69ms | **0.66ms（10x）** | V3-2 |
| 文本节点更新（单文本） | replaceChild 44.85ms/万次 | **nodeValue 2.66ms（9x）** | V3-1 |
| 更新单行 DOM 写 | 1 | **0**（nodeValue 直改） | V3-1 |
| 受控输入 10 字符 DOM 写 | 10 | **0** | V3-1 |
| 稳定数组透传（200 项） | 全量 patch | **DOM 写 0（引用短路）** | V3-3a |
