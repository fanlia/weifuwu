/**
 * render() — mount reactive templates to the DOM.
 *
 * Usage:
 *   render(document.getElementById('app'), () => html`<h1>${title}</h1>`)
 */

import { effect } from './signal.ts'

/**
 * Render a reactive template into a container.
 *
 * @param container - DOM element to render into
 * @param template - Function returning html() Node or Node[]
 */
export function render(
  container: HTMLElement,
  template: () => Node | Node[],
): () => void {
  // Initial render
  const result = template()

  if (result instanceof Node) {
    container.innerHTML = ''
    container.appendChild(result)
  } else if (Array.isArray(result)) {
    container.innerHTML = ''
    for (const node of result) {
      container.appendChild(node)
    }
  }

  // Return cleanup
  return () => {
    container.innerHTML = ''
  }
}

/**
 * Reactive render — re-renders when signals change.
 * Returns a cleanup function.
 */
export function reactiveRender(
  container: HTMLElement,
  template: () => Node | Node[],
): () => void {
  const dispose = effect(() => {
    const result = template()

    container.innerHTML = ''
    if (result instanceof Node) {
      container.appendChild(result)
    } else if (Array.isArray(result)) {
      for (const node of result) {
        container.appendChild(node)
      }
    }
  })

  return dispose
}
