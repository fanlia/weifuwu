/**
 * render() — mount reactive templates to the DOM.
 *
 * Usage:
 *   render(document.getElementById('app'), () => h('h1', null, title))
 *   reactiveRender(document.getElementById('app'), () => h('span', null, count))
 */
/**
 * Render a template function into a container (one-shot).
 * Invokes onmount callbacks after DOM insertion.
 *
 * @param container - DOM element to render into
 * @param template - Function returning a Node (h() result)
 * @returns Cleanup function that empties the container
 */
export declare function render(container: HTMLElement, template: () => Node): () => void;
/**
 * Reactive render — re-renders the template when any Signal/Computed
 * inside the template function changes. Invokes onmount after each render.
 * Returns a cleanup function that stops updates.
 */
export declare function reactiveRender(container: HTMLElement, template: () => Node, fallback?: (error: Error) => Node): () => void;
