/**
 * h() — Low-level DOM element factory.
 *
 * Creates DOM elements directly without innerHTML or string parsing.
 *
 * ```ts
 * h('button', { onclick: fn }, 'Click me')
 * // → <button>Click me</button> with click listener
 *
 * h('div', { class: 'card' },
 *   h('h2', null, title),
 *   h('p', null, content),
 * )
 * ```
 */
import { Signal, Computed } from './signal.ts';
export interface HAttrs {
    [key: string]: unknown;
}
export type HChild = Node | string | number | boolean | null | undefined | Signal | Computed | HChild[];
/**
 * Create a DOM element with attributes and children.
 *
 * Attribute conventions:
 * - `onclick`, `oninput`, etc. → addEventListener
 * - `onmount` → lifecycle callback (called after DOM insertion)
 * - `class` or `className` → setAttribute('class', ...)
 * - boolean values → setAttribute / removeAttribute
 * - Signal/Computed values → reactive binding
 * - null/undefined → skip
 *
 * Children:
 * - Node → appendChild
 * - string/number → createTextNode
 * - null/undefined/false → skip
 * - Array → flatten recursively
 */
/**
 * Create a DOM element or invoke a component function.
 *
 * When `tag` is a string, creates an HTML element (like createElement).
 * When `tag` is a function (component), calls it with attrs and children.
 */
export declare function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: HAttrs | null, ...children: HChild[]): HTMLElementTagNameMap[K];
/**
 * Conditional rendering — works inside reactiveRender.
 *
 * Server: evaluates condition via peek() during SSR
 * Client: subscribes to signal via effect, re-evaluates on change
 *
 * ```ts
 * const show = ref(false)
 * reactiveRender(app, () =>
 *   h('div', null,
 *     when(show, () => h('p', null, 'shown when truthy')),
 *   )
 * )
 * ```
 */
export declare function when(condition: Signal | Computed | unknown, factory: () => HChild): HChild;
/**
 * List rendering — works inside reactiveRender.
 *
 * Server: maps over peek() array during SSR
 * Client: subscribes to signal via effect, re-maps on change
 *
 * ```ts
 * const items = ref(['a', 'b', 'c'])
 * reactiveRender(app, () =>
 *   h('ul', null,
 *     each(items, (item, i) => h('li', null, item)),
 *   )
 * )
 * ```
 */
export declare function each<T = unknown>(items: Signal<T[]> | Computed<T[]> | T[], factory: (item: T, index: number) => HChild): HChild[];
/**
 * Convenience: create a text node.
 */
export declare function text(content: string | number | boolean | null | undefined): Text;
/**
 * Convenience: create a DocumentFragment from nodes or h() calls.
 */
export declare function fragment(...children: HChild[]): DocumentFragment;
/**
 * Walk the tree and invoke onmount callbacks registered via h(el, { onmount: fn }).
 * Called by render() / reactiveRender() after DOM insertion.
 */
export declare function triggerMount(el: HTMLElement | DocumentFragment): void;
