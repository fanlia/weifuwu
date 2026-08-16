# vdom3 透明度优化计划·第三轮（2026-12——执行状态：未开始）

> 前两轮：round 1（剪枝 reason / 跨层错误 / props 红线 / 调试工具）·
> round 2（props 内容级 / 渲染性能 / 因果链 causeId / 触发源 stack）。
>
> **本轮（round 3）——剩余的黑盒**（现状确认均无事件）：
> - **keyed 重排的移动**：keyed diff 移动 DOM（insertBefore）——无 node:move 事件——
>   列表重排"为什么移动"不可见
> - **调度排队**：渲染合并/防重入（updating/dirty）——无事件——"渲染为什么延迟/跳过"
>   不可见
> - **portal 弹层生命周期**：弹层开合（usePopup 等）——无 portal:open/close——
>   "弹层什么时候开/为什么关"不可见
> - **监听器泄漏**：unmount 清理（unbindAll）有——但"卸载后残留"无 dev 检测——
>   泄漏静默（组件删了监听还在——事件仍响应）

---

## 阶段 1：keyed 重排透明（node:move 事件——移动的因果）

### 1.1 keyed 移动的 DOM 操作可观测

**现状**：`patchKeyedChildren` 重排时 `parent.insertBefore(n, ref)`（移动）——
**无 node:move 事件**（只有 node:remove/insert）——列表重排的"移动"在事件流里
表现为 remove+insert（或完全不可见——insertBefore 无事件）——业务排查
"列表为什么重排/这个元素为什么动了"不可见。

**方案**：
- keyed 移动（`collected` 整体移动——lastDom 位置校正）——发射 `node:move` 事件：
  ```ts
  ev('node', 'move', id, { parent, ref: refId, causeId, key })
  ```
- 非移动（复用原位）不发射——只有真正 insertBefore 移动的
- `__wf_tail` 可见 `node:move`——keyed 重排可观测

**验收**：keyed 列表重排 → `node:move` 事件（目标/ref/key）——`__wf_tail` 可见

**风险**：低（事件发射——不影响 DOM 行为）。

---

## 阶段 2：调度时间线透明（render:queued/flushed——渲染排队可见）

### 2.1 调度决策事件

**现状**：`updating`（防重入）/`dirty`（合并）——渲染排队/跳过——无事件——
业务"调了 render 但没立即渲染"（同 tick 合并）——不可见"合并/排队"。

**方案**：
- 调度决策事件（root.ts 的 update/updateComponent 入口）：
  - `render:queued`（渲染进入排队——同 tick 已有一个在跑——本次合并）
  - `render:flushed`（排队渲染实际执行——真正跑了一次）
- payload：`{ target: compId | 'root', cause: 'manual' | 'coalesced' }`
- 业务"render 了但没反应"→ `__wf_tail` 看到 `render:queued`（合并）——知道调度语义

**验收**：同 tick 多次 render → `render:queued`（N-1 次）+ `render:flushed`（1 次）——
合并可见

**风险**：低（事件发射）。

---

## 阶段 3：portal 生命周期透明（portal:open/close——弹层开合因果）

### 3.1 portal 容器生命周期事件

**现状**：弹层（dropdown/select/datepicker/modal 等——usePopup）经 portal 渲染
到 `#__wf_portal`——开合即 portal 内容的创建/移除——但**无 portal 级事件**——
"弹层什么时候开/为什么关"需从 node 操作推断（且 portal 在远程容器——与父树
事件流分离感）。

**方案**：
- portal 内容首次挂载（容器创建/首个节点插入）→ `portal:open`（payload：`{ portalKey }`）
- portal 内容全部移除（容器清空）→ `portal:close`（payload：`{ portalKey }`）
- 实施点：render.ts 的 portal 分支（renderVNode/removePortalContent）——容器
  首节点/末节点计数（容器 childNodes 从 0→N→0 的转换点）

**验收**：弹层打开 → `portal:open`（portalKey）；关闭 → `portal:close`——
`__wf_tail` 可见弹层生命周期

**风险**：低（事件发射——容器状态计数）。

---

## 阶段 4：监听器泄漏检测（dev audit——unmount 后 delegate 残留）

### 4.1 卸载后监听残留的 dev 告警

**现状**：节点移除清理（`unbindAll`）有——但**泄漏静默**（组件卸载但监听残留——
delegate 注册表残留——事件仍响应——内存/行为泄漏）——无检测。

**方案**（dev——`__WF_V3_AUDIT !== '0'`）：
- delegate 注册表加**计数 API**（`listenerCount(id)`——某节点的绑定数）
- unmount 后（comp:unmount 事件订阅）——延迟（微任务）检查该组件的根节点
  绑定是否已清空——残留 → `console.warn`（组件名/残留数——去重）
- 生产零开销（audit 关）

**验收**：卸载后监听残留 → dev warn（组件名）——正常卸载 → 无

**风险**：低（dev only——计数 API）。

---

## 阶段 5：调试工具增强（`__wf_comp(id)`——组件时间线）

### 5.1 组件完整生命周期聚合

**现状**：`__wf_builds`（构建决策）——但组件**完整时间线**（mount/render/update/
props/unmount）需多条过滤拼接。

**方案**：`__wf_comp(id)` ——该组件的全部事件（按 session 顺序聚合）：
```ts
__wf_comp(compId) // [{ entity:'comp', action:'mount', ... }, { comp:render }, ...]
```
- 便捷调试（一次看组件的完整生命周期）

**验收**：`__wf_comp(id)` 返回组件全部事件（时间序）

**风险**：低（调试工具）。

---

## 执行顺序与依赖

```
阶段 1（keyed 移动——独立）
阶段 2（调度——独立）
阶段 3（portal——独立）
阶段 4（泄漏检测——依赖 delegate 计数 API）
阶段 5（调试工具——聚合已有事件——依赖 1/3 的新事件也自然包含）
```

**建议顺序**：1 → 2 → 3 → 4 → 5（按价值/风险）

## 测试与预算

- 阶段 1：keyed 重排 → node:move 事件（target/ref/key）
- 阶段 2：同 tick 多次 render → render:queued + flushed（合并可见）
- 阶段 3：弹层开关 → portal:open/close（portalKey）
- 阶段 4：卸载后监听残留 → dev warn（去重）；正常卸载 → 无
- 阶段 5：__wf_comp(id) 聚合组件事件
- 每阶段独立提交可回滚

## 风险总览

| 阶段 | 风险 | 缓解 |
|---|---|---|
| 1 | 低 | 事件发射——不影响 DOM 行为 |
| 2 | 低 | 事件发射——payload 区分合并/执行 |
| 3 | 低 | 容器状态计数（0→N→0 转换点） |
| 4 | 低 | dev only——计数 API |
| 5 | 低 | 调试工具 |
