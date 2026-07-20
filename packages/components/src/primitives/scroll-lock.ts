/**
 * Scroll lock — prevents body scrolling.
 * Tracks nesting depth for multiple consumers (e.g., Modal inside Drawer).
 * Returns cleanup function.
 */

let depth = 0
let originalOverflow = ''
let originalPaddingRight = ''

export function scrollLock(el: HTMLElement = document.body): () => void {
  if (depth === 0) {
    originalOverflow = el.style.overflow
    originalPaddingRight = el.style.paddingRight
    const scrollbarWidth = window.innerWidth - el.clientWidth
    if (scrollbarWidth > 0) el.style.paddingRight = `${scrollbarWidth}px`
    el.style.overflow = 'hidden'
  }
  depth++

  return () => {
    depth--
    if (depth === 0) {
      el.style.overflow = originalOverflow
      el.style.paddingRight = originalPaddingRight
    }
  }
}
