/**
 * weifuwu/ui-dom — FocusTrap
 */

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

import { createClientBrowser } from './browser.ts'
const browser = createClientBrowser()

export function trapFocus(container: HTMLElement): () => void {
  const focusable = container.querySelectorAll<HTMLElement>(FOCUSABLE)
  if (focusable.length === 0) return () => {}

  const first = focusable[0]
  const last = focusable[focusable.length - 1]

  const handler = (e: KeyboardEvent) => {
    if (e.key !== 'Tab') return
    if (e.shiftKey && browser.activeElement() as HTMLElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && browser.activeElement() as HTMLElement === last) {
      e.preventDefault()
      first.focus()
    }
  }

  const prevFocused = browser.activeElement() as HTMLElement as HTMLElement | null
  // 初始聚焦：weifuwu 的 ref 在元素 appendChild 前触发（元素未连接文档时 focus() 无效），
  // 延迟到微任务——此时同任务内的 mount 已完成，元素已连接（浏览器实测 TRAP firstIsConn=false）
  queueMicrotask(() => { first.focus() })

  container.addEventListener('keydown', handler)
  return () => {
    container.removeEventListener('keydown', handler)
    prevFocused?.focus()
  }
}
