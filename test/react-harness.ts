/**
 * Minimal React test harness for hook testing.
 * Renders a component into happy-dom and tracks hook results.
 */
import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'

let root: Root | null = null
let container: HTMLDivElement | null = null

/**
 * Render a hook-testing component into a detached DOM container.
 * The component should call the hook and store the result in a closure variable.
 *
 * ```ts
 * let result!: ReturnType
 * function Test() { result = useMyHook(); return null }
 * renderHook(Test)
 * ```
 */
export function renderHook(Component: () => null): void {
  // Cleanup previous render
  if (root) {
    root.unmount()
  }

  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  root.render(createElement(Component))
}

/**
 * Cleanup the test DOM. Call in after() if needed.
 */
export function cleanup(): void {
  if (root) {
    root.unmount()
    root = null
  }
  if (container && container.parentNode) {
    container.parentNode.removeChild(container)
    container = null
  }
}
