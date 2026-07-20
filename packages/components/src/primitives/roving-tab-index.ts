/**
 * Roving tab index — keyboard navigation for a group of tabbable items.
 * Arrow keys move focus; Tab exits the group.
 * Returns cleanup function.
 */
export function rovingTabIndex(
  container: HTMLElement,
  getItems: () => HTMLElement[],
  options?: { orientation?: 'horizontal' | 'vertical'; wrap?: boolean }
): () => void {
  const { orientation = 'horizontal', wrap = true } = options ?? {}
  const prevKey = orientation === 'horizontal' ? 'ArrowLeft' : 'ArrowUp'
  const nextKey = orientation === 'horizontal' ? 'ArrowRight' : 'ArrowDown'

  const handler = (e: KeyboardEvent) => {
    const items = getItems()
    if (items.length === 0) return
    const current = document.activeElement as HTMLElement
    let idx = items.indexOf(current)

    if (e.key === prevKey) {
      e.preventDefault()
      idx = idx <= 0 ? (wrap ? items.length - 1 : 0) : idx - 1
      items[idx]?.focus()
    } else if (e.key === nextKey) {
      e.preventDefault()
      idx = idx >= items.length - 1 ? (wrap ? 0 : items.length - 1) : idx + 1
      items[idx]?.focus()
    }
  }

  container.addEventListener('keydown', handler)
  return () => container.removeEventListener('keydown', handler)
}
