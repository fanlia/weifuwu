# vdom3 事件代理方案（event delegation）

> 用户决策 2026-12：**所有事件注册采用代理方式，而不是注册到组件自身**。
> 目标：监听器 O(1)、零重绑、事件流更精准（handler 更新零噪音）、SSR/hydration 简化。

## 1. 现状与问题

当前 vdom3：`el.addEventListener(key.slice(2).toLowerCase(), handler)`——**每个元素逐个注册**：

- **重绑噪音**：renderFn 内定义的 handler 每次渲染新函数 → patch 时 UNBIND + BIND（事件流两条事件）——`稳定引用纪律（§5.1）`成为必要——否则重绑风暴
- **监听器 O(n)**：大规模组件树（1000+ 节点 × 事件）监听器数量线性增长
- **事件流噪音**：UNBIND/BIND 高频（render 内定义 handler 的组件每次渲染都重绑）

## 2. 代理方案

```
组件渲染 → handler 写入代理注册表（按节点 id）
挂载点（createRoot/createRouter 的 root + portal 容器）注册原生监听（每挂载点每事件一次）
事件冒泡 → 挂载点监听 → e.target 向上找最近 [data-v3-id] → 查注册表 → 分发 handler
```

### 2.1 注册表（模块级——id 全局唯一）

```ts
// vdom3/events.ts 或新模块 vdom3/delegate.ts
interface DelegateRegistry {
  /** event → (nodeId → handler) */
  handlers: Map<string, Map<string, EventListener>>
  /** 已注册监听的挂载点（root + portal 容器——每挂载点每事件一次） */
  roots: Set<Element>
}
```

### 2.2 渲染层变化（render.ts）

| 场景 | 现状（元素级） | 代理（注册表） |
|------|--------------|--------------|
| 创建节点（有事件 props） | `el.addEventListener` + EVENT_BIND | `handlers.set(event, nodeId, handler)` + EVENT_BIND（挂载点首次注册监听时发一次） |
| patch 属性（handler 变化） | UNBIND + BIND（重绑） | **Map 覆盖**（零事件——handler 更新零噪音） |
| 节点移除 | removeEventListener + EVENT_UNBIND | `handlers.delete` + EVENT_UNBIND（代理删除） |

### 2.3 挂载点监听（一次注册）

```ts
function ensureDelegationRoot(root: Element): void {
  if (roots.has(root)) return
  roots.add(root)
  for (const event of KNOWN_EVENTS) {
    root.addEventListener(event, (e) => dispatch(root, e), true)  // capture——先于组件内 stopPropagation？
  }
}

function dispatch(root: Element, e: Event): void {
  let el = e.target as Element | null
  // 文本节点 → 父元素；向上找最近 [data-v3-id]
  while (el && el !== root && !el.hasAttribute('data-v3-id')) el = el.parentElement
  if (!el) return
  const id = el.getAttribute('data-v3-id')
  const handler = handlers.get(e.type)?.get(id)
  if (handler) handler(e)
}
```

### 2.4 监听哪些事件

**捕获 vs 冒泡**：代理用**冒泡**（与现状一致——事件在目标触发后冒泡到挂载点）。
但 `stopPropagation` 的元素（组件内阻止冒泡）不会到挂载点——**现状同样**（stopPropagation 阻止元素级监听后的冒泡——但元素自身监听已触发）——**代理下 stopPropagation 会阻止分发**——**语义差异**！

**处理**：**捕获阶段监听**（capture: true——先于目标/冒泡）——**但**——捕获阶段 stopPropagation 的组件？——**权衡**：
- **冒泡代理**：语义最接近现状（stopPropagation 生效）——但组件内 stopPropagation 会跳过代理分发——**组件库用 stopPropagation 的地方**（Select 面板内点击等）——**它们 stopPropagation 的是"外部点击关闭"（document 级监听）**——**不是元素级 onClick**——**元素级 onClick 的 stopPropagation 少**（有——Menu 等）——**冒泡代理下这些 stopPropagation 会阻止 handler 分发**——**bug 风险**！
- **捕获代理**：捕获先于冒泡——元素级 handler 在捕获后、冒泡前（事件先过捕获链：root capture → 目标 → 冒泡）——**捕获代理先分发**（handler 执行）——**然后元素级 stopPropagation 阻止后续**——**但**——**元素级监听已删**（代理接管）——**stopPropagation 在 handler 里调用**——**影响**：后续冒泡（其他代理/文档监听）——**与现状一致**（handler 里 stopPropagation 同样影响）

**决策**：**捕获阶段代理**（capture: true）——**handler 在捕获阶段执行**——**与现状的差异**：
- 现状：元素级监听（冒泡阶段——目标上）——stopPropagation 的 handler（在目标冒泡前？——**不**——元素级监听在目标上——stopPropagation 在 handler 内——影响后续冒泡）
- 代理捕获：handler 在捕获阶段执行——**先于目标阶段**——**如果组件在目标阶段有 stopPropagation**（其他库）——**代理已分发**（不受影响）——**语义差异**：代理 handler 先执行

**更稳**：**冒泡代理 + 捕获兜底**？——复杂。**或者**——**挂载点监听用捕获——但分发时模拟"目标阶段"**（dispatch 时直接调 handler——不管捕获/冒泡语义——**handler 执行时机：捕获阶段（早于现状）**）——**组件库对时机敏感吗**（focus/blur——**focus/blur 不冒泡**！——**代理需要 focusin/focusout**（冒泡版）——**事件列表**：
- click/mousedown/mouseup/mousemove/mouseover/mouseout（冒泡）
- focus/blur（不冒泡——用 focusin/focusout）
- keydown/keyup/keypress（冒泡）
- input/change/submit（冒泡）
- pointerdown/pointerup/pointermove（冒泡）
- touchstart/touchend（冒泡）
- wheel/scroll（不冒泡——scroll 用 capture）
- dragstart/drop（冒泡）
- compositionstart/compositionend（冒泡——IME）
- animationend（冒泡）

**方案**：挂载点监听**冒泡**（capture: false——与现状语义最接近）+ **不冒泡事件特例**（focus/blur → focusin/focusout；scroll/wheel → capture）——**stopPropagation 语义**：组件内 stopPropagation 会阻止分发——**与现状差异**——**但**——**现状**：元素级监听在目标上——**stopPropagation 在 handler 内**（handler 已执行）——**组件库在"监听器之前"stopPropagation 的场景**（事件监听器的 stopPropagation——比如 Menu 的 keydown stopPropagation——**它是组件 handler 内**）——**代理下同样在 handler 内**——**一致**——**真正差异**：**第三方/原生监听在冒泡中间 stopPropagation**（不是组件 handler）——**罕见**——**接受**。

**决策**：**冒泡代理**（capture: false——focus/blur 用 focusin/focusout 映射；scroll 用 capture 特例）。

### 2.5 Portal

portal 内容在 `#__wf_portal > [data-wf-portal-key]` 容器——**冒泡到 portal 容器（不是主 root）**——**portal 容器也是挂载点**（ensureDelegationRoot(portalContainer)）——**分发**：e.target 向上找 data-v3-id——**跨容器**（portal 内元素冒泡到 portal 容器——容器监听分发——handler 查到）——**主 root 监听不到 portal 内容**（不在其下）——**各自挂载点独立监听**——**一致**。

### 2.6 多挂载点/多实例

- 注册表**模块级全局**（id 全局唯一——registry 也是全局）
- 每个挂载点（createRoot/createRouter 的 root、portal 容器）`ensureDelegationRoot`——**每挂载点每事件一次监听**
- 卸载：removeDelegationRoot（监听移除 + handlers 清理）

## 3. 事件流适配

| 事件 | 现状 | 代理 |
|------|------|------|
| EVENT_BIND | 每元素每事件（创建时） | **每挂载点每事件一次**（首次注册）+ 每元素 handler 注册（**不发**——聚合到挂载点绑定） |
| EVENT_UNBIND | 节点移除时每绑定 | 节点移除时（注册表删除——**每节点每事件**） |
| **handler 更新** | UNBIND + BIND（重绑） | **零事件**（Map 覆盖——精准——事件流零噪音） |
| `event:update`（可选） | — | handler 更新可观测（payload: nodeId/event——debug 用） |

**事件流收益**：render 内定义 handler 的组件**零重绑事件**——事件数 = 实际变化数更纯粹。

## 4. 生命周期

- 创建：handler 注册（Map）+ 挂载点监听（首次）
- 更新：Map 覆盖（零事件）
- 移除：Map 删除 + EVENT_UNBIND
- 挂载点卸载：监听移除 + handlers 清理（该挂载点下节点）

## 5. 收益与风险

**收益**：
- 监听器 O(1)（每挂载点每事件一次）
- 零重绑（§5.1 稳定引用纪律不再是正确性要求——仅性能建议）
- 事件流零噪音（handler 更新零事件）
- SSR/hydration 简化（无需逐元素接线）

**风险/裁剪**：
- stopPropagation 语义差异（冒泡代理——组件 handler 内 stopPropagation 一致；第三方中间拦截罕见——接受）
- focus/blur 不冒泡——focusin/focusout 映射（组件库的 onFocus/onBlur 语义一致——focusin 冒泡）
- 事件时机：冒泡阶段（与现状一致——目标阶段后）
- 高频事件（mousemove/scroll）代理分发开销——handler 查找 O(1)——可接受

## 6. 实施步骤

1. `vdom3/delegate.ts`：注册表 + ensureDelegationRoot + dispatch
2. render.ts：createNode/patchProps/移除 的事件绑定 → 代理注册
3. 事件流适配（EVENT_BIND 挂载点级 + handler 更新零事件）
4. 组件库回归（on* 全走代理——语义验证）
5. 测试：代理绑定/更新/移除 + 事件流断言 + Portal + stopPropagation
6. 浏览器端到端（Dropdown/Modal/Tour/Select 交互）
