/**
 * render() — mount reactive templates to the DOM.
 *
 * Usage:
 *   render(document.getElementById('app'), () => h('h1', null, title))
 *   reactiveRender(document.getElementById('app'), () => h('span', null, count))
 */

import { effect } from './signal.ts'
import { triggerMount } from './h.ts'

/**
 * Render a template function into a container (one-shot).
 * Invokes onmount callbacks after DOM insertion.
 *
 * @param container - DOM element to render into
 * @param template - Function returning a Node (h() result)
 * @returns Cleanup function that empties the container
 */
export function render(
  container: HTMLElement,
  template: () => Node,
): () => void {
  const result = template()

  container.innerHTML = ''
  if (result instanceof Node) {
    container.appendChild(result)
  }

  // Trigger onmount callbacks
  if (result instanceof HTMLElement || result instanceof DocumentFragment) {
    triggerMount(result)
  }

  return () => {
    container.innerHTML = ''
  }
}

/**
 * Reactive render — re-renders the template when any Signal/Computed
 * inside the template function changes. Invokes onmount after each render.
 * Returns a cleanup function that stops updates.
 */
export function reactiveRender(
  container: HTMLElement,
  template: () => Node,
): () => void {
  const dispose = effect(() => {
    const result = template()

    container.innerHTML = ''
    if (result instanceof Node) {
      container.appendChild(result)
    }

    if (result instanceof HTMLElement || result instanceof DocumentFragment) {
      triggerMount(result)
    }
  })

  return dispose
}
