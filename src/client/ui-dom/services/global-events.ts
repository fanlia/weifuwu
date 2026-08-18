/**
 * services/global-events — 全局监听聚合（浏览器能力——引擎无关——vdom4 UI-5）
 *
 * hooks（useGlobalKey/useDrag/usePopup 外部点击等）的 document/window 监听统一入口——
 * 同事件多 handler 聚合到目标单个监听。vdom3 引擎内部的事件流观测版在
 * vdom3/delegate.ts（转发本模块 + EVENT_BIND/UNBIND 包装——引擎特性）——
 * 两处语义一致（本模块是纯能力——v5 换引擎 hooks 零改动）。
 */

/** 不冒泡事件 → 冒泡等价（focus/blur/mouseenter/mouseleave——聚合监听需冒泡） */
const EVENT_MAP: Record<string, string> = {
  focus: 'focusin',
  blur: 'focusout',
  mouseenter: 'mouseover',
  mouseleave: 'mouseout',
}

const globalHandlers = new Map<EventTarget, Map<string, Set<EventListener>>>()
const globalRoots = new Map<EventTarget, Map<string, EventListener>>()

export interface GlobalListenerOptions { capture?: boolean; passive?: boolean }

/** 元素级监听（引擎无关——直接 addEventListener——once 自动解绑。
 *  vdom3 的 delegate 版（bindEvent + 代理分发）读 data-v3-id——vdom4 节点用
 *  data-v4-id——失效——hooks 统一走本服务（直接绑定——无代理依赖）） */
export function bindElementListener(el: Element, event: string, handler: EventListener, once = false): () => void {
  el.addEventListener(event, handler, once ? { once: true } : undefined)
  return () => el.removeEventListener(event, handler)
}

/** 全局监听（document/window 级——同事件多 handler 聚合——每目标每事件一次监听） */
export function addGlobalListener(target: EventTarget, event: string, handler: EventListener, opts?: GlobalListenerOptions): () => void {
  const realEvent = EVENT_MAP[event] ?? event
  // handler 集合按 (target, event) 分组——同事件多个 target（document + window）
  // 各自只调自己集合的 handler（X-F1 抓出：跨 target 共享集合 → 同一 handler
  // 在传播路径上被多个聚合监听重复调用——closed=2）
  let set = globalHandlers.get(target)?.get(realEvent)
  if (!set) {
    if (!globalHandlers.has(target)) globalHandlers.set(target, new Map())
    set = new Set()
    globalHandlers.get(target)!.set(realEvent, set)
  }
  set.add(handler)
  const rootMap = globalRoots.get(target) ?? new Map<string, EventListener>()
  if (!rootMap.has(realEvent)) {
    const fn: EventListener = (e) => {
      for (const h of globalHandlers.get(target)?.get(realEvent) ?? []) {
        try { h(e) } catch { /* 全局 handler 失败隔离 */ }
      }
    }
    const addOpts = opts?.capture
      ? ({ capture: true, passive: opts?.passive ?? false } as AddEventListenerOptions)
      : undefined
    target.addEventListener(realEvent, fn, addOpts)
    rootMap.set(realEvent, fn)
    globalRoots.set(target, rootMap)
  }
  // 退订：移除 handler——空集时移除目标监听（配对清理）
  return () => {
    set.delete(handler)
    if (set.size === 0) {
      const fn = rootMap.get(realEvent)
      if (fn) target.removeEventListener(realEvent, fn, opts?.capture ? { capture: true } : undefined)
      rootMap.delete(realEvent)
      if (rootMap.size === 0) globalRoots.delete(target)
      globalHandlers.get(target)?.delete(realEvent)
      if (globalHandlers.get(target)?.size === 0) globalHandlers.delete(target)
    }
  }
}
