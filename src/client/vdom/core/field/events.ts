/**
 * vdom core — 事件通道（on[A-Z] → addEventListener）
 *
 * 规则（AGENTS §4.0/§6.4）：
 * - 判定 `on + 大写`（EVENT_RE）——`once`/`only` 等 on 开头属性不误判
 * - 事件名小写化：onClick → click（jsdom/浏览器通用）
 * - 非函数值：console.warn + 跳过（不抛 DOMException 中断渲染管线）
 * - prev 旧监听：引用变化时 removeEventListener（diff 重绑正确性）
 */

/** 事件 prop 判定（on + 大写——`once`/`only` 不误判） */
export const EVENT_RE = /^on[A-Z]/

/** 事件名解析（onClick → click；非事件返回 null） */
export function eventName(key: string): string | null {
  if (!EVENT_RE.test(key)) return null
  return key.slice(2).toLowerCase()
}

/** 事件绑定（prev 旧监听先解绑——引用变化 = 重绑正确性） */
export function bindEvent(el: HTMLElement, key: string, value: unknown, prev?: unknown): void {
  const name = eventName(key)
  if (!name) return
  if (prev && typeof prev === 'function') {
    el.removeEventListener(name, prev as EventListener)
  }
  if (typeof value !== 'function') {
    console.warn(`[vdom] 事件 prop ${key} 需要函数——当前 ${typeof value}（跳过）`)
    return
  }
  el.addEventListener(name, value as EventListener)
}
