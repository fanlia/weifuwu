/**
 * Click outside detection — fires callback when click occurs outside the element.
 * Returns cleanup function.
 */
export function createClickAway(el: HTMLElement, fn: (e: MouseEvent) => void): () => void {
  const handler = (e: MouseEvent) => {
    if (!el.contains(e.target as Node)) fn(e)
  }
  // Use mousedown for better UX (fires before blur)
  document.addEventListener('mousedown', handler, true)
  return () => document.removeEventListener('mousedown', handler, true)
}
