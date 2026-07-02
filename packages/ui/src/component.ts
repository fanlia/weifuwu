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
import { ref, type Signal } from './signal.ts'
import { type HChild, type HAttrs } from './h.ts'

// ── Scoped signal ────────────────────────────────────────────

interface SignalScope {
  signals: Map<number, Signal>
  nextKey: number
}

let currentScope: SignalScope | null = null

/**
 * Creates a ref scoped to the current component instance.
 * Must be called inside a component() factory function.
 *
 * Unlike ref(), signal() guarantees each component instance
 * gets its own isolated state.
 */
export function signal<T>(initial: T): Signal<T> {
  if (currentScope) {
    const key = currentScope.nextKey++
    if (!currentScope.signals.has(key)) {
      currentScope.signals.set(key, ref(initial))
    }
    return currentScope.signals.get(key) as Signal<T>
  }
  // Fallback: plain ref (during initialization)
  return ref(initial)
}

// ── Component factory ───────────────────────────────────────

export type Component<P = Record<string, unknown>> = (
  attrs?: P & HAttrs,
  ...children: HChild[]
) => HTMLElement

interface ComponentInstance {
  el: HTMLElement | null
  scope: SignalScope
}

/**
 * Create a reusable component with isolated state.
 *
 * The factory function is called once per instance.
 * Use signal() inside the factory for instance-scoped reactive state.
 * Return an h() call or a DOM element.
 */
export function component<P = Record<string, unknown>>(
  factory: (props: P & HAttrs & { children?: HChild[] }) => HTMLElement,
): Component<P> {
  const instances = new Map<number, ComponentInstance>()
  let nextId = 0

  const Component = (attrs?: P & HAttrs, ...children: HChild[]): HTMLElement => {
    const id = nextId++
    let instance = instances.get(id)

    if (!instance) {
      const scope: SignalScope = { signals: new Map(), nextKey: 0 }
      const prevScope = currentScope
      currentScope = scope

      const mergedAttrs = {
        ...(attrs || {}),
        ...(children.length > 0 ? { children } : {}),
      } as P & HAttrs & { children?: HChild[] }
      const el = factory(mergedAttrs)

      currentScope = prevScope
      instance = { el, scope }
      instances.set(id, instance)
    }

    return instance.el!
  }

  return Component
}
