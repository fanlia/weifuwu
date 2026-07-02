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

export interface HAttrs {
  [key: string]: unknown
}

export type HChild = Node | string | number | boolean | null | undefined | Signal | Computed | HChild[]

/**
 * Create a DOM element with attributes and children.
 *
 * Attribute conventions:
 * - `onclick`, `oninput`, etc. → addEventListener
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
export function h(
  tag: string,
  attrs: HAttrs | null,
  ...children: HChild[]
): HTMLElement {
  const el = document.createElement(tag)

  if (attrs) {
    for (const [key, value] of Object.entries(attrs)) {
      if (value == null) continue

      // Event listeners: onclick, oninput, onkeydown, etc.
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
          ;(el as any)[key] = currentVal
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
            ;(el as any)[key] = newVal
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
    const sig = child as unknown as Signal
    const textNode = document.createTextNode(sig.value == null ? '' : String(sig.value))
    el.appendChild(textNode)
    if (sig._addSub) {
      sig._addSub(() => {
        textNode.textContent = sig.value == null ? '' : String(sig.value)
      })
    }
  } else {
    el.appendChild(document.createTextNode(String(child)))
  }
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
