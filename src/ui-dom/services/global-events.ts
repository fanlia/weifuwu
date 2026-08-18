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

const globalHandlers = new Map<string, Set<EventListener>>()
const globalRoots = new Map<EventTarget, Map<string, EventListener>>()

export interface GlobalListenerOptions { capture?: boolean; passive?: boolean }

/** 全局监听（document/window 级——同事件多 handler 聚合——每目标每事件一次监听） */
export function addGlobalListener(target: EventTarget, event: string, handler: EventListener, opts?: GlobalListenerOptions): () => void {
  const realEvent = EVENT_MAP[event] ?? event
  let set = globalHandlers.get(realEvent)
  if (!set) { set = new Set(); globalHandlers.set(realEvent, set) }
  set.add(handler)
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
  }
  // 退订：移除 handler——空集时移除目标监听（配对清理）
  return () => {
    set.delete(handler)
    if (set.size === 0) {
      const fn = rootMap.get(realEvent)
      if (fn) target.removeEventListener(realEvent, fn, opts?.capture ? { capture: true } : undefined)
      rootMap.delete(realEvent)
      if (rootMap.size === 0) globalRoots.delete(target)
    }
  }
}
