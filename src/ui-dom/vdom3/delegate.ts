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
/** 监听计数 API（round3 阶段 4——泄漏检测：unmount 后残留检查——
 *  handlers[event][nodeId] 数 = 某节点的绑定数） */
export function listenerCount(nodeId: string | null): number {
  if (!nodeId) return 0
  let n = 0
  for (const m of handlers.values()) if (m.has(nodeId)) n++
  return n
}

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

/** 不冒泡事件 → 冒泡等价（代理依赖冒泡）——
 *  focus/blur → focusin/focusout；mouseenter/mouseleave → mouseover/mouseout
 *  （mouseenter 不冒泡——挂载点监听收不到子元素进入——真实 hover 不触发——
 *  真实事故：Chart 数据点 onMouseEnter 真实鼠标悬停无 tooltip——
 *  eval dispatchEvent（强制冒泡）能触发——真实 hover 不能） */
const EVENT_MAP: Record<string, string> = {
  focus: 'focusin',
  blur: 'focusout',
  mouseenter: 'mouseover',
  mouseleave: 'mouseout',
}
/** 反向映射（分发查 handler——e.type → 原事件） */
const REVERSE_MAP: Record<string, string> = {
  focusin: 'focus',
  focusout: 'blur',
  mouseover: 'mouseenter',
  mouseout: 'mouseleave',
}

/** 无冒泡等价的不冒泡事件（img 的 error/load 等——规范不冒泡——
 *  捕获阶段才经过祖先——挂载点监听需 capture） */
const NON_BUBBLING = new Set(['error', 'load', 'loadstart', 'loadend', 'abort', 'unload', 'resize', 'message'])

/** 用户文本输入事件（dispatch 时额外发 text:input——用户输入可观测） */
const TEXT_INPUT_EVENTS = new Set(['input', 'change', 'compositionstart', 'compositionend'])

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

/** 插入后补注册（真实 bug：svg/深层元素递归渲染时父未挂载——bindDelegated
 *  的 rootOf(parent) 返回 null——挂载点监听缺失——事件代理不触发——
 *  agent-browser 实测：Chart 数据点（svg 内 circle）真实 hover 无 tooltip——
 *  HoverCard（div——父已挂）正常）。插入完成后对事件 props 补注册挂载点。 */
export function ensureDelegationFor(el: Element, props: Record<string, unknown>): void {
  const root = rootOf(el)
  if (!root) return
  for (const [key, val] of Object.entries(props)) {
    if (typeof val === 'function' && /^on[A-Z]/.test(key)) {
      const event = key.slice(2).toLowerCase()
      // 去重键用真实事件（映射对齐 ensureRootEvent——避免逻辑键检查漏判重复注册）
      const realEvent = EVENT_MAP[event] ?? event
      if (!registered.get(root)?.has(realEvent)) ensureRootEvent(root, event)
    }
  }
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
  // 文本跟踪退订配对（addGlobalListener 的 off——document 监听移除——测试隔离）
  for (const off of textTrackingOff) off()
  textTrackingOff = []
  selectionReady = false
}

/** 注册挂载点（createRoot/createRouter 挂载时调用） */
export function ensureDelegationRoot(root: Element): void {
  roots.add(root)
  ensureTextTracking()
}

// ── 用户文本操作跟踪（选区 + 剪贴板——selectionchange rAF 节流 +
//    copy/cut/paste 全局监听——统一走事件代理（addGlobalListener——聚合注册/
//    退订 + EVENT_BIND/UNBIND 可观测）——不依赖组件绑定——任何用户文本交互可观测） ──
let selectionReady = false
let selectionRaf = 0
let textTrackingOff: (() => void)[] = []

/** 选中文本摘要（copy/cut/select 共用——含起点元素 id） */
function selectionInfo(): { target: string | null; text: string } {
  const sel = document.getSelection?.()
  const text = sel?.toString?.() ?? ''
  const anchor = sel?.anchorNode
  const target = anchor && anchor.nodeType === 1
    ? (anchor as Element).getAttribute?.('data-v3-id') ?? null
    : anchor?.parentElement?.getAttribute?.('data-v3-id') ?? null
  return { target, text }
}

function ensureTextTracking(): void {
  if (selectionReady) return
  selectionReady = true
  if (typeof document === 'undefined') return
  const onSelection = () => {
    if (selectionRaf) return
    selectionRaf = requestAnimationFrame(() => {
      selectionRaf = 0
      try {
        const { target, text } = selectionInfo()
        if (!text) return // 无选中（取消/失焦）——不发
        stream.emit(ev('text', 'select', undefined, { target, length: text.length, sample: text.slice(0, 40) }))
      } catch { /* 选区读取失败隔离 */ }
    })
  }
  textTrackingOff.push(addGlobalListener(document, 'selectionchange', onSelection as EventListener))
  // 剪贴板操作（copy/cut/paste——用户文本复制粘贴可观测——含内容摘要）
  const clipboardInfo = (e: Event): { target: string | null; sample: string } => {
    const { target, text } = selectionInfo()
    // copy/cut 记选中内容；paste 记剪贴板内容（clipboardData——安全读取）
    let sample = text
    if (e.type === 'paste') {
      const dt = (e as ClipboardEvent).clipboardData
      sample = dt?.getData?.('text') ?? ''
    }
    return { target, sample: sample.slice(0, 40) }
  }
  const onClip = (e: Event) => {
    if (e.type !== 'copy' && e.type !== 'cut' && e.type !== 'paste') return
    try {
      const { target, sample } = clipboardInfo(e)
      if (!sample) return // 无内容——不发（零噪音）
      stream.emit(ev('text', e.type as 'copy' | 'cut' | 'paste', undefined, {
        target,
        length: sample.length,
        sample,
      }))
    } catch { /* 剪贴板读取失败隔离（隐私/权限） */ }
  }
  textTrackingOff.push(addGlobalListener(document, 'copy', onClip as EventListener))
  textTrackingOff.push(addGlobalListener(document, 'cut', onClip as EventListener))
  textTrackingOff.push(addGlobalListener(document, 'paste', onClip as EventListener))
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

/** 挂载点惰性注册事件监听（每挂载点每真实事件一次——EVENT_BIND 发一次）
 *  去重键用 realEvent（非逻辑 event）：mouseenter → mouseover 映射后，
 *  直接键 onMouseOver 与映射键 onMouseEnter 同时请求时只注册一个 mouseover
 *  监听（否则同一真实事件双监听——dispatch 跑两遍——handler 双触发——
 *  真实事故：components-demo root 两个 mouseover 监听——Chart onMouseEnter
 *  与 Tooltip onMouseOver 并存时重复分发） */
function ensureRootEvent(root: Element, event: string): void {
  const realEvent = EVENT_MAP[event] ?? event
  const set = registered.get(root) ?? new Set<string>()
  if (set.has(realEvent)) return
  set.add(realEvent)
  registered.set(root, set)
  // 冒泡监听（与元素级语义一致：stopPropagation 的 handler 影响后续冒泡——
  // 组件 handler 内 stopPropagation 与现状一致）；不冒泡事件（error/load 等）
  // 用捕获监听（捕获阶段经过祖先——dispatch 才能收到）——保存引用（卸载可 remove）
  const fn: EventListener = (e) => dispatch(e)
  const useCapture = NON_BUBBLING.has(realEvent)
  root.addEventListener(realEvent, fn, useCapture ? { capture: true } : undefined)
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
  // 反向映射：挂载点监听 mouseover（映射自 mouseenter）——分发时查原事件 handler
  // （真实 hover 事故：onMouseEnter 注册 mouseenter——e.type 是 mouseover——
  // 直接查 handlers[mouseover] 无——需 REVERSE_MAP 解析）
  // 直接键与映射键必须同时分发：onMouseOver（直接键）与 onMouseEnter（映射键）
  // 语义不同（每经过触发 vs 进入触发）互不替代——只选一个会静默吞掉另一个
  // （真实事故：components-demo Tooltip wrapProps.onMouseOver 存在时，
  // handlers.has('mouseover') 优先走直接键——Chart 数据点 onMouseEnter 永不触发）
  const keys: string[] = []
  if (handlers.has(e.type)) keys.push(e.type)
  const mapped = REVERSE_MAP[e.type]
  if (mapped && mapped !== e.type && handlers.has(mapped)) keys.push(mapped)
  if (keys.length === 0) return
  while (el) {
    // closest 优化：跳过无 data-v3-id 的中间层（浏览器原生——目标层有 id 时零循环）
    if (!el.hasAttribute?.('data-v3-id')) {
      const idEl = el.closest?.('[data-v3-id]')
      if (idEl && idEl !== el) { el = idEl; continue }
    }
    const id = el.getAttribute?.('data-v3-id')
    if (id) {
      for (const k of keys) {
        const entry = handlers.get(k)?.get(id)
        if (!entry) continue
        // 模拟元素级监听语义：currentTarget = handler 绑定的元素（原生事件
        // 的 currentTarget 是"正在处理事件的监听器所在元素"——代理监听在挂载点
        // ——组件库 e.currentTarget 取触发元素（Img fallback/DatePicker 定位/
        // Menu 锚点/Rate 星等）——必须还原为绑定元素）
        try {
          Object.defineProperty(e, 'currentTarget', { value: el, configurable: true })
        } catch { /* 原生只读属性——尽力而为 */ }
        try { entry.handler(e) } catch { /* handler 失败隔离——错误事件化由上层覆盖 */ }
        // 用户文本输入事件（text:input——输入/组合可观测——含当前值）
        if (TEXT_INPUT_EVENTS.has(e.type)) {
          const value = (el as HTMLInputElement | HTMLTextAreaElement | null)?.value ?? null
          stream.emit(ev('text', 'input', id, { event: e.type, value: typeof value === 'string' ? value.slice(0, 100) : null }))
        }
        // once：分发一次后自动解绑（EVENT_UNBIND——可观测——与 addEventListener
        // { once: true } 等价但生命周期入事件流）
        if (entry.once) {
          handlers.get(k)!.delete(id)
          stream.emit(ev('event', 'unbind', id, { event: e.type }))
        }
        if (e.cancelBubble) break
      }
      if (e.cancelBubble) break // handler 内 stopPropagation——停止向上分发
    }
    el = el.parentElement
  }
}
