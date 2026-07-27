/**
 * weifuwu/client — FocusTrap
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

  const prevFocused = document.activeElement as HTMLElement | null
  first.focus()

  container.addEventListener('keydown', handler)
  return () => {
    container.removeEventListener('keydown', handler)
    prevFocused?.focus()
  }
}
