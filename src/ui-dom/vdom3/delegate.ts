/**
 * vdom3 event delegation — 事件代理（用户决策：事件注册到代理而非组件自身）
 *
 * 架构：
 *   组件渲染 → handler 写入代理注册表（按节点 id——Map 覆盖零重绑）
 *   挂载点（createRoot/createRouter 的 root + portal 容器）注册原生监听
 *   （每挂载点每事件一次——监听器 O(1)）——惰性（首次绑定某事件时注册）
 *   事件冒泡 → 挂载点监听 → e.target 向上找最近 [data-v3-id] → 查注册表 → 分发
 *
 * 收益：
 *   - 监听器 O(1)（每挂载点每事件一次——非每元素）
 *   - 零重绑（handler 变化 = Map 覆盖——事件流零噪音——§5.1 稳定引用仅为性能建议）
 *   - 生命周期：EVENT_BIND（挂载点首次注册）/ EVENT_UNBIND（节点移除时代理删除）
 */

import { stream, ev } from './events.ts'

/** event → (nodeId → 条目{handler, once})——模块级全局（节点 id 全局唯一） */
const handlers = new Map<string, Map<string, { handler: EventListener; once: boolean }>>()
/** 已注册监听的挂载点（root + portal 容器） */
const roots = new Set<Element>()
/** 挂载点 → 已注册的事件（惰性——每挂载点每事件一次） */
const registered = new Map<Element, Set<string>>()
/** 挂载点 → (真实事件 → 监听函数)——removeDelegationRoot 的 removeEventListener 配对 */
const rootListeners = new Map<Element, Map<string, EventListener>>()

// ── 全局监听（document/window 级——hooks 统一入口：useGlobalKey/useDrag/
//    usePopup 外部点击/Escape/useBreakpoint resize——统一注册/退订 + 事件流可观测） ──
/** event → handler 集合（全局监听——非 id 分发——直接调用） */
const globalHandlers = new Map<string, Set<EventListener>>()
/** 目标（document/window）→ 已挂载的 (真实事件 → 统一监听函数) */
const globalRoots = new Map<EventTarget, Map<string, EventListener>>()

/** 不冒泡事件 → 冒泡等价（focus/blur 用 focusin/focusout——代理依赖冒泡） */
const EVENT_MAP: Record<string, string> = {
  focus: 'focusin',
  blur: 'focusout',
}

/** 绑定/更新 handler（Map 覆盖——零重绑零事件） */
export function bindEvent(nodeId: string, event: string, handler: EventListener, once = false): void {
  let m = handlers.get(event)
  if (!m) { m = new Map(); handlers.set(event, m) }
  m.set(nodeId, { handler, once })
}

/** 解绑（节点移除——代理删除 + EVENT_UNBIND） */
export function unbindEvent(nodeId: string, event: string): void {
  if (handlers.get(event)?.delete(nodeId)) {
    stream.emit(ev('event', 'unbind', nodeId, { event }))
  }
}

/** 解绑节点的全部事件（移除统一清理——注册表与元素级标记解耦） */
export function unbindAll(nodeId: string): void {
  for (const [event, m] of handlers) {
    if (m.delete(nodeId)) {
      stream.emit(ev('event', 'unbind', nodeId, { event }))
    }
  }
}
/** 元素级监听统一入口（动画生命周期等——ref 回调的 el）：
 *  注册到代理（once 自动解绑）+ 挂载点监听（el 已挂载——向上找）——返回退订 */
export function bindElementListener(el: Element, event: string, handler: EventListener, once = false): () => void {
  const id = el.getAttribute('data-v3-id')
  if (!id) return () => {}
  bindEvent(id, event, handler, once)
  const root = rootOf(el)
  if (root) ensureRootEvent(root, event)
  return () => unbindEvent(id, event)
}

/** 测试/调试隔离：清空注册表与挂载点（模块级 handlers 跨测试残留——
 *  节点 id 各测试从 n1 重新分配——旧 handler 可能被错误分发） */
export function resetDelegation(): void {
  handlers.clear()
  roots.clear()
  registered.clear()
  rootListeners.clear()
  globalHandlers.clear()
  globalRoots.clear()
}

/** 注册挂载点（createRoot/createRouter 挂载时调用） */
export function ensureDelegationRoot(root: Element): void {
  roots.add(root)
}

/** 移除挂载点（卸载——removeEventListener 配对 + 注册表清理；
 *  handler 由节点移除清理（unbindAll）） */
export function removeDelegationRoot(root: Element): void {
  roots.delete(root)
  registered.delete(root)
  const listeners = rootListeners.get(root)
  if (listeners) {
    for (const [realEvent, fn] of listeners) root.removeEventListener(realEvent, fn)
    rootListeners.delete(root)
  }
}

/** 从节点向上找挂载点（O(depth)——首次绑定事件时注册监听） */
function rootOf(node: Node | null): Element | null {
  let el: Node | null = node
  while (el) {
    if (el.nodeType === 1 && roots.has(el as Element)) return el as Element
    el = el.parentNode
  }
  return null
}

/** 挂载点惰性注册事件监听（每挂载点每事件一次——EVENT_BIND 发一次） */
function ensureRootEvent(root: Element, event: string): void {
  const set = registered.get(root) ?? new Set<string>()
  if (set.has(event)) return
  set.add(event)
  registered.set(root, set)
  const realEvent = EVENT_MAP[event] ?? event
  // 冒泡监听（与元素级语义一致：stopPropagation 的 handler 影响后续冒泡——
  // 组件 handler 内 stopPropagation 与现状一致）——保存引用（卸载可 remove）
  const fn: EventListener = (e) => dispatch(e)
  root.addEventListener(realEvent, fn)
  const m = rootListeners.get(root) ?? new Map<string, EventListener>()
  m.set(realEvent, fn)
  rootListeners.set(root, m)
  // 挂载点 id（root → 'root'；portal 容器 → 'portal:key'）
  const rootId = root.hasAttribute('data-wf-portal-key')
    ? `portal:${root.getAttribute('data-wf-portal-key')}`
    : 'root'
  stream.emit(ev('event', 'bind', rootId, { event: realEvent, delegated: true }))
}

/** 全局监听（document/window 级——hooks 统一入口）：
 *  同事件多 handler 聚合到一个目标监听（EventTarget 每事件一次）——
 *  统一注册/退订 + 事件流可观测（EVENT_BIND/UNBIND——delegated: true）。
 *  options.capture：scroll 等不冒泡事件的捕获监听（嵌套容器滚动跟踪）。
 *  mql/visualViewport 等浏览器 API 对象（无事件冒泡语义）不纳入——保持直接监听。 */
export interface GlobalListenerOptions { capture?: boolean; passive?: boolean }
export function addGlobalListener(target: EventTarget, event: string, handler: EventListener, opts?: GlobalListenerOptions): () => void {
  const realEvent = EVENT_MAP[event] ?? event
  let set = globalHandlers.get(realEvent)
  if (!set) { set = new Set(); globalHandlers.set(realEvent, set) }
  set.add(handler)
  // 目标首次注册该事件时挂统一监听（EventTarget 每事件一次——多 handler 聚合）
  const rootMap = globalRoots.get(target) ?? new Map<string, EventListener>()
  if (!rootMap.has(realEvent)) {
    const fn: EventListener = (e) => {
      for (const h of globalHandlers.get(realEvent) ?? []) {
        try { h(e) } catch { /* 全局 handler 失败隔离 */ }
      }
    }
    const addOpts = opts?.capture
      ? ({ capture: true, passive: opts?.passive ?? false } as AddEventListenerOptions)
      : undefined
    target.addEventListener(realEvent, fn, addOpts)
    rootMap.set(realEvent, fn)
    globalRoots.set(target, rootMap)
    stream.emit(ev('event', 'bind', target === window ? 'window' : 'document', { event: realEvent, delegated: true, capture: opts?.capture ?? false }))
  }
  // 退订：移除 handler——空集时移除目标监听（配对清理）
  return () => {
    set.delete(handler)
    if (set.size === 0) {
      const fn = rootMap.get(realEvent)
      if (fn) target.removeEventListener(realEvent, fn, opts?.capture ? { capture: true } : undefined)
      rootMap.delete(realEvent)
      if (rootMap.size === 0) globalRoots.delete(target)
      stream.emit(ev('event', 'unbind', target === window ? 'window' : 'document', { event: realEvent }))
    }
  }
}

/** 渲染时绑定（createNode/patchProps 调用——事件 props 处理）：
 *  注册 handler + 确保挂载点监听（向上找——首次） */
export function bindDelegated(nodeId: string, event: string, handler: EventListener, parent: Node | null): void {
  bindEvent(nodeId, event, handler)
  if (parent) {
    const root = rootOf(parent)
    if (root) ensureRootEvent(root, event)
  }
}


/** 事件分发（挂载点监听回调——冒泡语义：e.target 向上沿祖先链查 handler——
 *  每层有 data-v3-id 的节点都执行（handler 可能在祖先——如 Tabs 容器 onKeyDown）；
 *  handler 内 stopPropagation（cancelBubble）后停止向上——与原生冒泡一致） */
function dispatch(e: Event): void {
  let el = e.target as Element | null
  if (el && el.nodeType === 3) el = el.parentElement
  const m = handlers.get(e.type)
  if (!m) return
  while (el) {
    const id = el.getAttribute?.('data-v3-id')
    if (id) {
      const entry = m.get(id)
      if (entry) {
        try { entry.handler(e) } catch { /* handler 失败隔离——错误事件化由上层覆盖 */ }
        // once：分发一次后自动解绑（EVENT_UNBIND——可观测——与 addEventListener
        // { once: true } 等价但生命周期入事件流）
        if (entry.once) {
          m.delete(id)
          stream.emit(ev('event', 'unbind', id, { event: e.type }))
        }
        if (e.cancelBubble) break // handler 内 stopPropagation——停止向上分发
      }
    }
    el = el.parentElement
  }
}
