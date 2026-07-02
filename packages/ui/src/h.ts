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
import { Signal, Computed } from './signal.ts'

// Lifecycle: mount callbacks registered via h(el, { onmount: fn })
const mountCallbacks = new WeakMap<HTMLElement, (el: HTMLElement) => void>()

export interface HAttrs {
  [key: string]: unknown
}

export type HChild = Node | string | number | boolean | null | undefined | Signal | Computed | HChild[]

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
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: HAttrs | null,
  ...children: HChild[]
): HTMLElementTagNameMap[K]
export function h(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tag: string | ((attrs: any, ...children: any[]) => HTMLElement),
  attrs: HAttrs | null,
  ...children: HChild[]
): HTMLElement {
  // Component function — call it with attrs
  if (typeof tag === 'function') {
    return tag(attrs, ...children)
  }
  const el = document.createElement(tag)

  if (attrs) {
    for (const [key, value] of Object.entries(attrs)) {
      if (value == null) continue

      // Lifecycle: onmount — not an event listener, stored for later invocation
      if (key === 'onmount' && typeof value === 'function') {
        mountCallbacks.set(el, value as (el: HTMLElement) => void)
        continue
      }

      // Event listeners: onclick, oninput, onkeydown, onchange, etc.
      if (key.startsWith('on') && typeof value === 'function') {
        el.addEventListener(key.slice(2).toLowerCase(), value as EventListener)
        continue
      }

      // Reactive Signal/Computed
      if (value instanceof Signal || value instanceof Computed) {
        const currentVal = value.value
        // Handle boolean signals (checked, disabled, etc.)
        if (typeof currentVal === 'boolean') {
          if (currentVal) el.setAttribute(key, '')
          else el.removeAttribute(key)
        } else if (key in el) {
          ;(el as unknown as Record<string, unknown>)[key] = currentVal
        } else {
          el.setAttribute(key, String(currentVal))
        }
        // Track for updates
        const updater = () => {
          const newVal = value.value
          if (typeof newVal === 'boolean') {
            if (newVal) el.setAttribute(key, '')
            else el.removeAttribute(key)
          } else if (key in el) {
            ;(el as unknown as Record<string, unknown>)[key] = newVal
          } else {
            el.setAttribute(key, String(newVal))
          }
        }
        if (value instanceof Signal) {
          value._addSub(updater)
        }
        continue
      }

      // Boolean attributes: checked, disabled, etc.
      if (typeof value === 'boolean') {
        if (value) el.setAttribute(key, '')
        continue
      }

      // Special handling for class
      if (key === 'class' || key === 'className') {
        el.setAttribute('class', String(value))
        continue
      }

      el.setAttribute(key, String(value))
    }
  }

  // Append children
  for (const child of children) {
    appendChild(el, child)
  }

  return el
}

function appendChild(el: HTMLElement, child: HChild): void {
  if (child == null || child === false) return

  if (child instanceof Node) {
    el.appendChild(child)
  } else if (Array.isArray(child)) {
    for (const c of child) {
      appendChild(el, c)
    }
  } else if (typeof child === 'object' && child !== null && 'value' in child) {
    // Reactive child (Signal/Computed)
    const reactive = child as unknown as { value: unknown; _addSub?: (fn: () => void) => void }
    const textNode = document.createTextNode(reactive.value == null ? '' : String(reactive.value))
    el.appendChild(textNode)
    if (typeof reactive._addSub === 'function') {
      reactive._addSub(() => {
        textNode.textContent = reactive.value == null ? '' : String(reactive.value)
      })
    }
  } else {
    el.appendChild(document.createTextNode(String(child)))
  }
}

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
export function when(
  condition: Signal | Computed | unknown,
  factory: () => HChild,
): HChild {
  if (condition instanceof Signal || condition instanceof Computed) {
    return condition.value ? factory() : null
  }
  return condition ? factory() : null
}

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
export function each<T = unknown>(
  items: Signal<T[]> | Computed<T[]> | T[],
  factory: (item: T, index: number) => HChild,
): HChild[] {
  const arr = items instanceof Signal || items instanceof Computed
    ? items.value
    : items
  return arr.map((item, i) => factory(item, i))
}

/**
 * Convenience: create a text node.
 */
export function text(content: string | number | boolean | null | undefined): Text {
  return document.createTextNode(content == null ? '' : String(content))
}

/**
 * Convenience: create a DocumentFragment from nodes or h() calls.
 */
export function fragment(...children: HChild[]): DocumentFragment {
  const frag = document.createDocumentFragment()
  for (const child of children) {
    appendChild(frag as unknown as HTMLElement, child)
  }
  return frag
}

/**
 * Walk the tree and invoke onmount callbacks registered via h(el, { onmount: fn }).
 * Called by render() / reactiveRender() after DOM insertion.
 */
export function triggerMount(el: HTMLElement | DocumentFragment): void {
  const cb = mountCallbacks.get(el as HTMLElement)
  if (cb) cb(el as HTMLElement)
  for (let i = 0; i < el.childNodes.length; i++) {
    const child = el.childNodes[i]
    if (child instanceof HTMLElement || child instanceof DocumentFragment) {
      triggerMount(child)
    }
  }
}
