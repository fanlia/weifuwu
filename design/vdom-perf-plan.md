# vdom render 优化计划

> 状态：规划中（2026-08）
> 来源：vdom 引擎评估报告 + `src/components` 组件库调研 + `apps/` 应用层调研
> 目标：在不改变 render-only 心智（唯一触发 `render()`、无自动渲染）与「剪枝 + 三态 skip」架构的前提下，消除已识别的浪费与静默失效。

---

## 0. 背景：渲染管线现状

```
ctx.ui.render() / useExternal 触发 / 导航
  → scheduler.render(ids)          顺序队列（promise 链，串行）
    → renderByIds(id)              从 registry 定位组件 vnode
      → vnode._render(props)       ① 重跑目标组件 renderFn（同步，读最新闭包）
      → buildVNode(output, …)      ② async 预构建 output 子树
           ├─ mountAsyncComponent  动态挂载：reuse 复用 _render / 新实例跑工厂
           └─ 剪枝：props 同 + 版本同 + 旧 _child 有值 → 复用旧 _child（子树零递归）
      → patchValue(parent, …)      ③ 同步 diff（DOM 写）
           ├─ 三态 skip：同类型 + props 同 + 版本同 + 已构建 → 复用旧 _child
           ├─ native：patchProps（全量 key 遍历）+ patchChildren
           └─ 数组：allUnkeyed 按位置 / keyed diff（oldKeyMap + 位置校正）
```

**架构判断**：当前设计 = React 式（renderFn 每次全量重建 vnode 树），靠组件级 `_child` 缓存 +
剪枝实现「组件级 memo」等价物。**DOM 写已最小化**（剪枝 + 三态 skip）。主要浪费在：
JS 对象分配（vnode/childCtx）、mountAsyncComponent 固定开销、patchProps 全量遍历、keyed 双阶段移动。

---

## 1. 调研结论（识别的问题清单）

### 1.1 实锤 bug（静默失效——最高优先级）

**B-1：UIHandler 页面（直接返回 vnode）内部 `rerender()` 静默空操作**
- 复现：`apps/ui-router-demo/src/router.ts` Home 页面 `let clicks + ctx.ui.render()`——点击后不更新，无任何报错
- 根因链：UIHandler 直接返回 vnode（非两阶段组件）→ 页面根 native vnode **无 `_id`/`_render`** →
  `renderPath` 里 `rootUi._rootVNodeId = built._id = undefined` → `render()` 无参 → `self ? ... : resolve()` → 空操作
- 修复：① `rootUi.render` 无参且 self 未定义 → `console.warn` 一次（替代静默）；② 文档纪律
  （UIHandler 页面状态走 `createStore` + `useExternal`，或改用 async 组件形态）
- 佐证：components-demo 全部是 `Component` 形态（有 `_render`/`_id`）→ 正常；仅 UIHandler 形态失效

### 1.2 引擎固定开销（组件库调研——115 组件默认形态）

**P-1：mountAsyncComponent 剪枝命中路径仍创建 childCtx（浪费）**
- 现状：`buildVNode` 组件分支**无条件**调用 `mountAsyncComponent` → `Object.create(ctx)` × 2 +
  `childUi.render` 闭包函数 + `await factory()` 微任务——**剪枝命中时全部无用**（childCtx 只在
  「跑工厂 / renderFn 重跑」时需要）
- 场景：流式每 token N 条消息 × mountAsyncComponent、深层组件树每层 × 2-3 wrapper、列表全量重建
- 修复：剪枝判断前置到 childCtx 创建之前；命中路径只做 id 继承 + registry + `_render` 继承（轻量）

**P-2：diff 三态 skip 与 buildVNode 剪枝重复比较 props/版本**
- 现状：buildVNode 剪枝判断 `componentPropsEqual` + `verSame`（一次），diff 三态 skip 再比一次
  （同一对 vnode、相同判断——结果必然一致，纯浪费）
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

### 1.3 结构性（应用层 + 组件库共同模式——需基准支撑后决策）

**S-1：内联事件函数 → 三态 skip 失效（最大潜在收益）**
- 组件库 100%：Menu/Tree/Table 每个 item 的 onClick/onKeyDown 内联新建；应用层 100%：`onClick={() => { count++; rerender() }}`
- 后果：父组件每次 render → 子组件 props 值比较（函数引用不同）失败 → renderFn 全量重跑
- 修复（两阶段）：
  1. 原语：`ctx.ui.useStableCallback(fn, deps?)`——依赖不变返回稳定引用（React useCallback 的
     「位置即语义」版，与 useStableRef 同族；mount 作用域 + 卸载自动清理）
  2. 试点：Menu（`onClick` 读 `item.key`/`toggleOpen`——需把 render 期依赖函数提升到 mount 作用域）
     → 基准验证列表场景收益 → 决定推广范围
- 纪律先行：应用层「配置式数据（columns/options/items）定义在 mount 层/模块层」（DemoVirtualTable
  好模式 vs DemoTable 差模式）——文档引导，零成本

### 1.4 文档/残留（低优先级）

- **D-1**：demo 注释残留 `$`（layouts-demo Dashboard「（$ 响应式状态）」×3、components-demo aichat 示例 `chat={$}`）
- **D-2**：UIHandler 页面状态纪律 + 配置式数据 mount 层引导写入 docs/frontend.md

---

## 2. 优化计划（分阶段，每阶段验证标准）

### 阶段 0：基准（先量化，后优化）

- 新增 `src/test/client/render-perf.test.ts`（monkey-patch Node.prototype 计数 DOM 写，jsdom 可靠）
  - 场景 1：首帧渲染 1000 行 keyed 列表（DOM 写 + 耗时上界断言）
  - 场景 2：更新单行（断言 DOM 写 ≈ 1 次 textContent，无全量重排）
  - 场景 3：头部插入 1 行（断言 DOM 写 = 插入数，无 append+insert 双写）
  - 场景 4：流式追加 10 条（每帧 +1 条 → DOM 写 = 新增节点数）
  - 场景 5：受控输入 10 字符（DOM 写受控、无整树重建）
- 基线固化后各阶段对比（性能断言不设死值——相对基线比例）

### 阶段 1：正确性修复

| # | 项 | 改动 | 验证 |
|---|----|------|------|
| 1.1 | B-1 warn 兜底 | `rootUi.render` 无参 self 未定义 → `console.warn`（每页面一次） | 复现测试：UIHandler 页面点击后 warn 出现 + 文案提示改用组件形态 |
| 1.2 | B-1 文档 | docs/frontend.md：UIHandler 状态纪律（createStore/组件形态） | 文档审查 |
| 1.3 | D-1 残留清理 | layouts-demo/components-demo 注释 `$` → render-only 表述 | grep 残留 = 0 |

### 阶段 2：引擎低风险优化（语义零变化，全量测试守护）

| # | 项 | 改动 | 预期收益 |
|---|----|------|---------|
| 2.1 | P-1 剪枝快路径 | buildVNode 组件分支重构：剪枝判断前置 → 命中只做 id/registry/_render 继承；childCtx 惰性创建（移到「跑工厂/renderFn」路径）；`mountAsyncComponent` 拆为公共轻量 + 完整两部分 | 流式/深层树/列表：每组件省 2 对象 + 1 闭包 + 1 await 微任务 |
| 2.2 | P-2 三态 skip 简化 | diff 组件分支：`typeSame && newV._child === oldV._child` 替代 props/版本比较 | 消除重复 props 比较（顺带简化代码） |
| 2.3 | P-3 patchProps 快速路径 | 引用级浅比较全等 → return | 深层树 native 遍历跳过 |
| 2.4 | P-4 keyed 单次插入 | 新增节点 `insertBefore(lastDom?.nextSibling ?? null)` | 每次新增 2 次写 → 1 次 |
| 2.5 | P-5 normalize 统一 | renderValue flat(Infinity) → normalizeChildren | 展开一致性 + 微优化 |

**验证**：全量测试（`node --test`，预算 15s）+ render-perf 场景 2/3/4 断言 + typecheck。

### 阶段 3：结构优化（需阶段 0 基准支撑，逐个决策）

| # | 项 | 前置条件 | 说明 |
|---|----|---------|------|
| 3.1 | `useStableCallback` 原语 | 基准证明 S-1 是主导热点 | API + hooks 实现 + 单测；Menu 试点改造 + 基准对比 |
| 3.2 | 组件库事件函数稳定化 | 3.1 完成且收益验证 | Menu/Tree/Table/AiChat 逐步：事件函数提升 mount 作用域 / 改读 data 属性 |
| 3.3 | 文档引导（配置 mount 层） | 随时可做（低风险） | docs/frontend.md「配置式数据放 mount 层 / 薄封装用普通函数」 |

### 阶段 4：明确不做（及原因）

| 方案 | 原因 |
|------|------|
| 事件委托（root 单一监听 + 合成事件） | 语义风险高（stopPropagation / 非冒泡事件 / currentTarget），收益与风险不成比例；且事件函数引用变化是正确性要求（闭包读最新状态）——治本靠 S-1 纪律而非引擎 |
| 持久 vnode 树 / fiber 式组件级脏追踪 | 架构级重构，破坏 render-only 简单心智（「状态是普通对象，渲染唯一触发」是卖点） |
| scheduler 同帧批处理 / 微任务去重 | 违背 AGENTS.md §4.0「无 flush/微任务批处理」纪律（有意设计：render 立即生效） |
| renderFn 输出树缓存 | 不可行：renderFn 读闭包状态，输出不可预测；props 级 memo 已被剪枝覆盖 |
| 组件级脏追踪（隐式依赖图） | 引入隐式触发，违背 render-only 心智 |

---

## 3. 各阶段验证矩阵

| 阶段 | 验证 | 退出条件 |
|------|------|---------|
| 0 | render-perf.test.ts 5 场景 | 全绿 + 基线记录 |
| 1 | B-1 复现测试 + 全量测试 | warn 出现 + 全量全绿 |
| 2 | 全量测试 + render-perf 断言 + typecheck | 全绿 + 场景 2/3/4 DOM 写符合断言 |
| 3 | useStableCallback 单测 + Menu 基准对比 | API 全绿 + 列表场景 DOM 写/耗时下降（对比基线） |

## 4. 纪律提醒（执行时注意）

- AGENTS.md §7.1：测试预算 ≤15s（超时用 `--test-timeout` 定位）；新增测试不得引入挂起
- 阶段 2 每项独立提交（一项一个 commit，语义零变化 + 测试守护）
- 阶段 3 的 useStableCallback 是**新公共 API**——按 AGENTS.md §10 同步 docs/custom-components.md + docs/frontend.md 方法速查表
