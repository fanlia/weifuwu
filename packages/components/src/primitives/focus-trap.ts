/**
 * Focus trap — locks tab/focus within an element.
 * Returns a cleanup function. Supports nested traps.
 */

const FOCUSABLE = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function createFocusTrap(el: HTMLElement): () => void {
  const handler = (e: KeyboardEvent) => {
    if (e.key !== 'Tab') return
    const focusable = el.querySelectorAll<HTMLElement>(FOCUSABLE)
    if (focusable.length === 0) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }

  // Focus first element
  const first = el.querySelector<HTMLElement>(FOCUSABLE)
  first?.focus()

  el.addEventListener('keydown', handler)
  return () => el.removeEventListener('keydown', handler)
}
