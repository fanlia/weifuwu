/**
 * weifuwu/client — FocusTrap
 *
 * 在弹窗/抽屉内循环 Tab 焦点。返回清理函数。
 *
 * 使用：
 *   import { trapFocus } from 'weifuwu/client'
 *
 *   // 在 ref 回调中使用
 *   <div ref={el => { if (el) return trapFocus(el) }}>
 */

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function trapFocus(container: HTMLElement): () => void {
  const focusable = container.querySelectorAll<HTMLElement>(FOCUSABLE)
  if (focusable.length === 0) return () => {}

  const first = focusable[0]
  const last = focusable[focusable.length - 1]

  const handler = (e: KeyboardEvent) => {
    if (e.key !== 'Tab') return
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }

  // 保存并转移焦点
  const prevFocused = document.activeElement as HTMLElement | null
  first.focus()

  container.addEventListener('keydown', handler)
  return () => {
    container.removeEventListener('keydown', handler)
    // 关闭时恢复焦点
    prevFocused?.focus()
  }
}
