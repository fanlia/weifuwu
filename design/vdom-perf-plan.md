# vdom render 优化计划（v2）
> **状态（2026-12 确认）**：✅ 已完成——render 优化 v2（diff/调度）

> 状态：规划中（2026-08）· v1 的 P-1/P-2 前提已因 renderFn 异步化而成熟
> 来源：vdom 引擎评估报告 + `src/components` 组件库调研 + `apps/` 应用层调研
> 目标：在不改变 render-only 心智（唯一触发 `render()`、无自动渲染）与「剪枝 + 三态 skip」
> 架构的前提下，消除已识别的浪费与静默失效。
> **已实施（v2 前完成）**：renderFn 强制异步（类型 + 引擎 5 处衔接）+ 取消 scheduler
> （createRenderer 直接执行，await render() = DOM 同步）——见 §0.1。

---

## 0. 背景：渲染管线现状（v2）

```
ctx.ui.render() / useExternal 触发 / 导航
  → renderer.render(ids)           直接执行（无调度队列）——进行中合并（补跑最新状态）
    → renderOne(id)               从 registry 定位组件 vnode
      → await vnode._render(props) ① 重跑目标组件 renderFn（**强制异步**——可 await 数据）
      → buildVNode(output, …)      ② async 预构建 output 子树
           ├─ mountAsyncComponent  动态挂载：reuse 复用 _render / 新实例跑工厂
           ├─ 剪枝：props 同 + 版本同 + 旧 _child 有值 → 复用旧 _child（子树零递归，**零 await**）
           └─ 数组分支 Promise.all：**兄弟组件 renderFn 并行 await**（数据驱动并发取数）
      → patchValue(parent, …)      ③ 同步 diff（DOM 写）
           ├─ 三态 skip：同类型 + props 同 + 版本同 + 已构建 → 复用旧 _child
           ├─ native：patchProps（全量 key 遍历）+ patchChildren
           └─ 数组：allUnkeyed 按位置 / keyed diff（oldKeyMap + 位置校正）
```

### 0.1 已实施的架构变更（v2 前提）

- **renderFn 强制异步**：`RenderFn<P> = (props) => Promise<VNode | null>`——同步 renderFn 是类型错误；
  两阶段都可 await（统一异步心智）；diff 永不执行 renderFn（同步兜底改 throw——类型 + 实现双重强制）
- **取消 scheduler**：createRenderer（mount.ts 内联）——render() 直接执行，`await render() = DOM 已同步`
  （renderFn await 数据被吸收）；同一组件进行中合并（补跑最新状态）；不同组件并行（兄弟无竞态）
- **数据驱动并发取数**（自动获得）：buildVNode 数组分支 Promise.all 并行兄弟组件的 renderFn await

### 0.2 统一异步后的性能模型（v2 核心洞察）

```
组件一次更新的成本 =
    剪枝命中（props 同 + 版本同）→ O(1) 同步，零 await   ← 主要路径
    剪枝未命中 → await renderFn（可能数据延迟）+ 子树构建  ← 唯一有异步的路径
```

**性能模型收敛为单一变量：剪枝命中率**。优化聚焦：引擎侧降低剪枝判断常数（P-1/P-2），
组件侧提高命中率（S-1 稳定回调 + 文档引导）。

### 0.3 取数模式自由（机制与策略分离——数据层不绑架）

renderFn 异步化是**通用能力**（await 任意 Promise），不绑定 ctx.data。三种取数模式全部合法：

| 模式 | 写法 | 语义 | 适用 |
|---|---|---|---|
| ctx.data 管道 | `await ctx.data.get(key, fetcher)` | 缓存 + 并发合并 + SSR 三场景（fetcher 可以是任意函数） | 重复执行 / 跨组件共享 / 需要 SSR 的数据 |
| 直接 await | `await ctx.api.get(...)` / fetch / SDK | **每次 renderFn 重跑重新执行**（无缓存） | 一次性局部取数 |
| 事件驱动 | 闭包 let + fetch + render() | 只执行一次，renderFn 读闭包 | 需精确控制触发时机 / 有副作用 |

**框架职责**：机制（渲染管线对三种模式一视同仁——并发 + 原子落地 + 自动刷新都成立）；
策略（取数方式由开发者决定）。文档提供决策规则（§4.2）降低选择成本。

---

## 1. 问题清单（v2 更新）

### 1.1 实锤 bug（静默失效——最高优先级）

**B-1：UIHandler 页面（直接返回 vnode）内部 `rerender()` 静默空操作**
- 复现：`apps/ui-router-demo/src/router.ts` Home 页面 `let clicks + ctx.ui.render()`——点击后不更新，无任何报错
- 根因链：UIHandler 直接返回 vnode（非两阶段组件）→ 页面根 native vnode **无 `_id`/`_render`** →
  `renderPath` 里 `rootUi._rootVNodeId = built._id = undefined` → `render()` 无参 → `self ? ... : resolve()` → 空操作
- 修复：① `rootUi.render` 无参且 self 未定义 → `console.warn` 一次（替代静默）；② 文档纪律
  （UIHandler 页面状态走 `createStore` + `useExternal`，或改用 async 组件形态）
- 佐证：components-demo 全部是 `Component` 形态（有 `_render`/`_id`）→ 正常；仅 UIHandler 形态失效

### 1.2 引擎固定开销（组件库调研——115 组件默认形态）

**P-1：mountAsyncComponent 剪枝命中路径仍创建 childCtx（浪费）——v2 价值提升**
- 现状：`buildVNode` 组件分支**无条件**调用 `mountAsyncComponent` → `Object.create(ctx)` × 2 +
  `childUi.render` 闭包函数 + `await factory()` 微任务——**剪枝命中时全部无用**（childCtx 只在
  「跑工厂 / renderFn 重跑」时需要）
- **v2 语境**：统一异步后「剪枝命中 = 零 await」是架构承诺——剪枝命中的主路径应完全同步 O(1)，
  childCtx 创建是主路径上唯一残留的对象分配
- 场景：流式每 token N 条消息 × mountAsyncComponent、深层组件树每层 × 2-3 wrapper、列表全量重建
- 修复：剪枝判断前置到 childCtx 创建之前；命中路径只做 id 继承 + registry + `_render` 继承（轻量）
  ——`mountAsyncComponent` 拆为公共轻量 + 完整（childCtx + 工厂）两部分

**P-2：diff 三态 skip 与 buildVNode 剪枝重复比较 props/版本——v2 条件成熟**
- 现状：buildVNode 剪枝判断 `componentPropsEqual` + `verSame`（一次），diff 三态 skip 再比一次
  （同一对 vnode、相同判断——结果必然一致，纯浪费）
- **v2 前提已满足**：diff 兜底已改 throw（diff 永不执行 renderFn）——「diff 完全信任 buildVNode 产出」
  从纪律升级为类型 + 实现必然
- 修复（优雅简化）：diff 三态 skip 条件改为 **`newV._child === oldV._child`**（buildVNode 剪枝命中时
  `_child` 直接复用旧引用——引用相等 = 剪枝已通过 props/版本判断）→ diff 不再比较 props/版本
- 顺带消除「两处比较结果不一致」的理论风险；force/版本变化路径自动正确（重跑后 `_child` 是新树）

**P-3：patchProps 无快速路径**
- 现状：每次 render 对每个 native 元素 `new Set([...oldKeys, ...newKeys])` + 全量遍历——值大多没变
  （class 字符串等），DOM 写已跳过（`ov === nv`）但遍历不可跳过
- 修复：开头引用级浅比较（key 长度 + 顺序 + 值 `===`）全等 → 直接 return；顺序不一致时回退全量
  （正确性无损，只是不优化）

**P-4：keyed diff 新增节点双阶段移动**
- 现状：新增节点 `parent.appendChild`（末尾）→ 再 `insertBefore(node, lastDom.nextSibling)` 校正
  ——**每次新增 2 次 DOM 写**（已论证双阶段正确性：匹配项校正兜底收敛顺序）
- 修复：新增节点直接 `insertBefore(node, lastDom?.nextSibling ?? null)`（1 次写；lastDom 为 null
  时等价 appendChild，与现状一致）；匹配项校正逻辑保留（兜底）

**P-5：normalizeChildren 未统一**
- 现状：`diff.ts` 用 `normalizeChildren`（栈实现，O(n)）；`render.ts` renderValue 仍用
  `.flat(Infinity)` 重复展开（Fragment/native children 两处）
- 修复：renderValue 统一换 `normalizeChildren`

**P-6（v2 新增）：SSR 数据驱动串行取数**
- 现状：`renderSsr` 数组分支 `for` 循环**串行** await——数据驱动 SSR 页面（多卡片组件各自 await API）
  在 SSR 端串行取数，与客户端 buildVNode 的 Promise.all 并行不对称
- 修复：数组分支改 `Promise.all` 并行（对齐客户端语义——统一异步后 SSR 也 await renderFn）
- 收益：数据驱动 SSR 页面取数加速（组件数 → 最慢组件耗时）

### 1.3 结构性（应用层 + 组件库共同模式——需基准支撑后决策）

**S-1：内联事件函数 → 三态 skip 失效（最大潜在收益）——v2 定论：mount/render 职责纪律**
- 组件库 100%：Menu/Tree/Table 每个 item 的 onClick/onKeyDown 内联新建；应用层 100%：`onClick={() => { count++; rerender() }}`
- 后果：父组件每次 render → 子组件 props 值比较（函数引用不同）失败 → renderFn 全量重跑
- **v2 语境**：剪枝命中率是唯一性能变量——内联函数直接打穿命中率；且「直接 await 取数」的用户
  （无 ctx.data 缓存）每次剪枝失败 = 重新请求——**S-1 同时是取数性能问题**（防重复请求）
- **定论（2026-08，useStableCallback 已删）**：不新增原语——事件函数按「mount/render 职责」分类书写：
  - **mount（外层工厂）定义**：依赖稳定引用的回调（ctx / mount let / initProps / 稳定 handle
    如 useChat 的 chat）——天然引用恒等（AiChat 的 send/stop 示范）
  - **render（内层 renderFn）定义**：依赖最新 props / 派生数据的回调（Table 的 toggleAll 读
    rowSelection、Menu 的 toggleOpen 读 openSet）——闭包捕获最新值；引用变化导致重绑是
    正确性要求（patchProps 对值没变的跳过——P-3 快速路径）
  - 事件函数引用变化是正确性要求（闭包读最新状态）——不追求「稳定引用」，追求「读对的值」
- 纪律先行：应用层「配置式数据（columns/options/items）定义在 mount 层/模块层」（DemoVirtualTable
  好模式 vs DemoTable 差模式）——文档引导，零成本

### 1.4 文档/残留（低优先级）

- **D-1**：demo 注释残留 `$`（layouts-demo Dashboard「（$ 响应式状态）」×3、components-demo aichat 示例 `chat={$}`）
- **D-2**：UIHandler 页面状态纪律 + 配置式数据 mount 层引导写入 docs/frontend.md
- **D-3（v2 新增）**：取数模式表（§0.3）写入 docs/frontend.md——替换「数据必须走 ctx.data」的绝对纪律，
  改为按场景选择 + 「直接 await = 每次 renderFn 重跑重新执行」的语义红线

---

## 2. 优化计划（分阶段，每阶段验证标准）

### 阶段 0：基准（先量化，后优化）

- 新增 `src/test/client/render-perf.test.ts`（monkey-patch Node.prototype 计数 DOM 写，jsdom 可靠）
  - 场景 1：首帧渲染 1000 行 keyed 列表（DOM 写 + 耗时上界断言）
  - 场景 2：更新单行（断言 DOM 写 ≈ 1 次 textContent，无全量重排）
  - 场景 3：头部插入 1 行（断言 DOM 写 = 插入数，无 append+insert 双写）
  - 场景 4：流式追加 10 条（每帧 +1 条 → DOM 写 = 新增节点数）
  - 场景 5：受控输入 10 字符（DOM 写受控、无整树重建）
  - **场景 6（v2 新增）**：剪枝命中率指标——renderFn 执行次数 / 总组件数
    （统一异步后这是核心性能变量；对比 mount/render 职责纪律落实前后的命中率）
- 基线固化后各阶段对比（性能断言不设死值——相对基线比例）

### 阶段 1：正确性修复

| # | 项 | 改动 | 验证 |
|---|----|------|------|
| 1.1 | B-1 warn 兜底 | `rootUi.render` 无参 self 未定义 → `console.warn`（每页面一次） | 复现测试：UIHandler 页面点击后 warn 出现 + 文案提示改用组件形态 |
| 1.2 | B-1 文档 | docs/frontend.md：UIHandler 状态纪律（createStore/组件形态） | 文档审查 |
| 1.3 | D-1 残留清理 | layouts-demo/components-demo 注释 `$` → render-only 表述 | grep 残留 = 0 |
| 1.4 | D-3 取数模式表（v2） | docs/frontend.md：§0.3 模式表 + 决策规则 + 「直接 await = 每次重跑重新执行」红线 | 文档审查 + 代码示例可编译 |

### 阶段 2：引擎低风险优化（语义零变化，全量测试守护）

| # | 项 | 改动 | 预期收益 |
|---|----|------|---------|
| 2.1 | P-1 剪枝快路径 | buildVNode 组件分支重构：剪枝判断前置 → 命中只做 id/registry/_render 继承；childCtx 惰性创建（移到「跑工厂/renderFn」路径）；`mountAsyncComponent` 拆为公共轻量 + 完整两部分 | 流式/深层树/列表：每组件省 2 对象 + 1 闭包 + 1 await 微任务——**主路径纯同步 O(1) 达成** |
| 2.2 | P-2 三态 skip 简化 | diff 组件分支：`typeSame && newV._child === oldV._child` 替代 props/版本比较 | 消除重复 props 比较（顺带简化代码——v2 前提已满足） |
| 2.3 | P-3 patchProps 快速路径 | 引用级浅比较全等 → return | 深层树 native 遍历跳过 |
| 2.4 | P-4 keyed 单次插入 | 新增节点 `insertBefore(lastDom?.nextSibling ?? null)` | 每次新增 2 次写 → 1 次 |
| 2.5 | P-5 normalize 统一 | renderValue flat(Infinity) → normalizeChildren | 展开一致性 + 微优化 |
| 2.6 | P-6 SSR 并行化（v2） | renderSsr 数组分支 `Promise.all` 并行 | 数据驱动 SSR 页面取数加速（对齐客户端） |

**验证**：相关测试组（AGENTS.md §7.1 新原则：开发只跑单文件/分组，全量发布前）+ render-perf 断言 + typecheck。

### 阶段 3：结构优化（需阶段 0 基准支撑，逐个决策）

| # | 项 | 前置条件 | 说明 |
|---|----|---------|------|
| 3.1 | **mount/render 职责文档**（已实施） | — | docs/custom-components.md：稳定引用 → mount 定义；props 派生 → render 内定义（接受重绑） |
| 3.2 | 组件库按职责自查 | 低（纪律，无新机制） | AiChat（chat 稳定 → mount）已示范；Table/Menu 的 props 派生回调留在 render（正确性优先） |
| 3.3 | 文档引导（配置 mount 层 + 取数模式） | 随时可做（低风险） | docs/frontend.md「配置式数据放 mount 层 / 薄封装用普通函数 / 取数模式表」 |

### 阶段 4：明确不做（及原因）

| 方案 | 原因 |
|------|------|
| 事件委托（root 单一监听 + 合成事件） | 语义风险高（stopPropagation / 非冒泡事件 / currentTarget），收益与风险不成比例；且事件函数引用变化是正确性要求（闭包读最新状态）——治本靠 S-1 纪律而非引擎 |
| 持久 vnode 树 / fiber 式组件级脏追踪 | 架构级重构，破坏 render-only 简单心智（「状态是普通对象，渲染唯一触发」是卖点） |
| scheduler 同帧批处理 / 微任务去重 | 违背 AGENTS.md §4.0「无 flush/微任务批处理」纪律（有意设计：render 立即生效；renderer 进行中合并已覆盖主要竞态） |
| renderFn 输出树缓存 | 不可行：renderFn 读闭包状态，输出不可预测；props 级 memo 已被剪枝覆盖 |
| renderFn 内任意异步调用自动 memo | 无法静态判断幂等性（副作用/非幂等 await 会误缓存）——防重复靠 ctx.data 缓存（可选）或开发者自己管理 |
| 组件级脏追踪（隐式依赖图） | 引入隐式触发，违背 render-only 心智 |

---

## 3. 各阶段验证矩阵

| 阶段 | 验证 | 退出条件 |
|------|------|---------|
| 0 | render-perf.test.ts 6 场景（含剪枝命中率） | 全绿 + 基线记录 |
| 1 | B-1 复现测试 + 相关测试组 | warn 出现 + 相关组全绿 |
| 2 | 相关测试组 + render-perf 断言 + typecheck | 全绿 + 场景 2/3/4 DOM 写符合断言 + 场景 6 命中率基线 |
| 3 | mount/render 职责文档 + AiChat mount 示范 | 文档审查 + 组件测试全绿 |

## 4. 纪律提醒（执行时注意）

- **AGENTS.md §7.1（v2 已更新）**：开发迭代只跑单文件/相关分组（快速定位）；**全量测试只在发布版本之前运行**
  （`npm test` + db 真库 docker 依赖）；bash 命令 timeout ≤15s
- 阶段 2 每项独立提交（一项一个 commit，语义零变化 + 测试守护）
- 阶段 3 的 mount/render 职责是**书写纪律**（无新 API）——docs/custom-components.md 已说明
- 取数模式（§0.3）是**文档纪律**（D-3）——不新增引擎机制；「直接 await = 每次重跑重新执行」写入红线
