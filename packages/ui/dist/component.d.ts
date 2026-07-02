/**
 * component() — Reusable component factory with instance-isolated state.
 *
 * Creates components that can be instantiated multiple times,
 * each with its own independent state.
 *
 * ```ts
 * const Counter = component((props) => {
 *   const count = signal(0)
 *
 *   return h('button', {
 *     class: 'wui-btn',
 *     onclick: () => count.value++,
 *   }, count)
 * })
 *
 * // Two independent counters
 * h('div', null,
 *   Counter({ label: 'A' }),
 *   Counter({ label: 'B' }),
 * )
 * ```
 */
import { type Signal } from './signal.ts';
import { type HChild, type HAttrs } from './h.ts';
/**
 * Creates a ref scoped to the current component instance.
 * Must be called inside a component() factory function.
 *
 * Unlike ref(), signal() guarantees each component instance
 * gets its own isolated state.
 */
export declare function signal<T>(initial: T): Signal<T>;
export type Component<P = Record<string, unknown>> = (attrs?: P & HAttrs, ...children: HChild[]) => HTMLElement;
/**
 * Create a reusable component with isolated state.
 *
 * The factory function is called once per instance.
 * Use signal() inside the factory for instance-scoped reactive state.
 * Return an h() call or a DOM element.
 */
export declare function component<P = Record<string, unknown>>(factory: (props: P & HAttrs & {
    children?: HChild[];
}) => HTMLElement): Component<P>;
