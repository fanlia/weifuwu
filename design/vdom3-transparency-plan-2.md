# vdom3 透明度优化计划·第二轮（2026-12——执行状态：已完成（1/2/3/4））

> 第一轮（vdom3-transparency-plan.md）完成：剪枝决策 reason 可见 /
> 跨层错误兜底 / props 不可变红线 / 调试工具（__wf_tail/__wf_builds）。
>
> **本轮（round 2）——更深层的"黑盒决策"**：
> - **props 内容级**：剪枝按**引用**判断——对象 props **内容变了但引用没变**时——
>   剪枝正确跳过（契约）——但业务"以为变了"——round 1 的 A.2 裁剪（提示噪音大）
>   本轮以**正确形式**补上（dev 深比较检测——只在真发生时提示——零噪音）
> - **性能黑盒**：每次渲染耗时/慢渲染——业务感知"卡"但不知道哪个组件/哪次渲染
> - **因果黑盒**：DOM 操作（node:remove 等）**为什么发生**（哪个 diff 决策导致）——
>   事件流是扁平的——决策与操作无显式关联
> - **更新触发源**：`ctx.render()` 是谁触发的（事件/定时器/滚动）——排查"为什么重渲染"

---

## 阶段 1：props 内容级透明（dev 深比较——round 1 A.2 的正确形式）

### 1.1 剪枝前内容检测（只在真发生时提示——零噪音）

**现状**：`propsEqual` 浅比较（引用）——对象 props 内容变但引用没变 → 剪枝跳过——
业务"以为变了"但渲染不更新（Chat 空 bubble 事故的变体——业务用了 `Object.assign`
/数组 push 等原地操作）。

**方案**（dev only——`__WF_V3_AUDIT !== '0'`）：
- 剪枝前——对 props 的**引用类型字段**（对象/数组——非函数）做**内容比较**
  （深比较——限制深度 4 / 节点数 1000——防御大对象）
- 内容变但引用没变 → `console.warn`（一次性/去重）：
  ```
  [vdom3/audit] 组件 X 的 props.k 内容已变但引用未变（原地修改对象？）——
  剪枝将跳过重渲染——请新建对象传 props（props 不可变契约）
  ```
- **零噪音**：只在"真发生"时提示（不像 round 1 A.2 的常亮提醒）——round 1 裁剪
  的理由（启动刷屏）消失——去重（同组件同 key 一次）

**成本**：深比较仅在 dev + 剪枝路径（reuse-skip 命中前）——生产零开销（audit 关）

**验收**：`Object.assign(props.obj, {...})` 后重渲染 → dev warn（明确指出组件/key）；
新建对象 → 无 warn——正常剪枝

**风险**：低（dev only——深比较防御深度/大小）。

---

## 阶段 2：渲染性能透明（render:duration + 慢渲染 warn）

### 2.1 渲染耗时事件

**现状**：渲染管线（buildVNode/patch）无耗时信息——业务感知"卡"但不知道：
哪个组件慢 / 哪次渲染慢 / 是否累积（大量小渲染 vs 一次大渲染）。

**方案**：
- 渲染会话（session）结束时——`render:duration` 事件：
  ```ts
  ev('render', 'duration', sessionId, { ms, buildMs, patchMs, comps: n })
  ```
  （root.ts 的 update/updateComponent 计时——buildVNode 与 patch 分段）
- 慢渲染 warn（阈值可配——`globalThis.__v3SlowMs`——默认 100ms）：
  ```
  [vdom3/audit] 渲染耗时 152ms（build 90ms + patch 62ms——组件 24 个）——session s12
  ```
- 组件级耗时（可选的 per-comp 聚合——`render:duration` 的 payload 含 top 慢组件
  ——buildVNode 里各组件 build 计时——top 3）

**验收**：`__wf_tail` 可见每次渲染的耗时——慢渲染（>阈值）有 warn（组件/session
可定位）——性能排查不再盲猜

**风险**：低（计时开销可忽略——性能事件是 trace 级——warn 阈值默认 100ms 不误报）。

---

## 阶段 3：事件因果链（决策 → DOM 操作的关联）

### 3.1 causeId（diff 决策与操作的显式关联）

**现状**：事件流扁平——`diff:transition`（决策）与后续 `node:create/insert/remove`
（操作）**无显式关联**——排查"这个 node:remove 为什么发生"需人工按顺序推断。

**方案**：
- 每次 diff 决策（patchInner 的 transition）分配 **causeId**（决策 id）
- 该决策产生的 DOM 操作（node:* / text:* / prop:*）事件 payload 带 `causeId`
- `__wf_tail(n, { causeId })` 过滤——"这个操作的决策链"
- 决策事件（diff:transition）payload 带 `causeId`——操作事件带相同 causeId——
  **因果可查**（决策 → 操作 1:1 或 1:N）

**实施点**：render.ts 的 patchInner（当前决策上下文传递——组件/元素递归——
用参数/上下文传递 causeId——**简化**（只对"重建/移除"类决策（异 type/null）——
高频的同 type patch 不分配（噪音））

**验收**：`__wf_tail(50, { causeId: 'c12' })` → 该决策的全部 DOM 操作——
"移除/重建为什么发生"一眼可见

**风险**：中（causeId 传递——决策上下文渗透 patch 调用链——简化范围（仅重建/
移除决策）控制改动面）。

---

## 阶段 4：更新触发源（ctx.render 的来源可见）

### 4.1 comp:render 的触发来源

**现状**：`comp:render` 事件（组件重渲染）——但**为什么触发**（事件回调/定时器/
滚动/store 通知/手动调用）不可见——排查"为什么反复重渲染"需读业务代码。

**方案**（调试模式——`__WF_V3_STACK` 开启时）：
- `comp:render` payload 加 `stack`（调用栈前 3 帧——`new Error().stack`）
- 默认关（栈开销）——调试时开（`__WF_V3_STACK='1'`）
- `__wf_tail(50, { comp })` → 可见该组件的每次渲染 + 触发栈

**验收**：调试模式——"谁触发了重渲染"栈可见（事件回调/定时器一目了然）

**风险**：低（默认关——栈开销仅调试）。

---

## 执行顺序与依赖

```
阶段 1（props 内容级——独立——直接补洞）
阶段 2（性能透明——独立）
阶段 3（因果链——render.ts 改动面稍大——简化范围控制）
阶段 4（触发源——调试模式——独立）
```

**建议顺序**：1 → 2 → 3 → 4（按价值/风险）

## 测试与预算

- 阶段 1：原地改对象 props → dev warn（组件/key 明确）；新建对象 → 无 warn
- 阶段 2：慢组件（sleep）→ render:duration 事件 + 慢渲染 warn（阈值可配）
- 阶段 3：重建决策 → DOM 操作带 causeId——`__wf_tail` 按 causeId 过滤
- 阶段 4：__WF_V3_STACK 开启 → comp:render 带栈（关闭 → 无）
- 每阶段独立提交可回滚

## 风险总览

| 阶段 | 风险 | 缓解 |
|---|---|---|
| 1 | 低 | dev only——深比较防御（深度/大小限制）——只在真发生时提示 |
| 2 | 低 | 计时开销可忽略——阈值可配不误报 |
| 3 | 中 | 仅重建/移除决策分配 causeId——高频同 type 不分配——控制改动面 |
| 4 | 低 | 默认关——栈开销仅调试 |
