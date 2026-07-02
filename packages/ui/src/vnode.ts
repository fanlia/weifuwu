/**
 * vnode — Server-compatible lightweight node tree.
 *
 * h() creates a plain-object tree instead of real DOM elements.
 * Used by page() for SSR serialization.
 *
 * On the client, the real h() from h.ts creates actual DOM elements.
 */

import { Signal, Computed } from './signal.ts'
import type { ShowNode, EachNode } from './control-flow.ts'

// ── VNode types ────────────────────────────────────────────────

export type VAttrValue = string | number | boolean | Signal | Computed | null | undefined

export interface VAttrs {
  [key: string]: VAttrValue | ((...args: unknown[]) => unknown) | null | undefined
}

export interface VNode {
  tag: string
  attrs: VAttrs | null
  children: VChild[]
}

export type VChild = VNode | string | number | boolean | null | undefined | Signal | Computed | ShowNode | EachNode | VChild[]

// ── h() — server version ───────────────────────────────────────

/**
 * Create a lightweight VNode tree.
 *
 * Signature matches the client-side h() for API compatibility.
 *
 * ```ts
 * h('div', { class: 'card' },
 *   h('span', null, count),       // count is a Signal
 *   h('button', { onclick: fn }, '+'),
 * )
 * ```
 */
export function h(
  tag: string,
  attrs: VAttrs | null,
  ...children: VChild[]
): VNode {
  return {
    tag,
    attrs: attrs ? processAttrs(attrs) : null,
    children: flatten(children),
  }
}

function processAttrs(attrs: VAttrs): VAttrs {
  const out: VAttrs = {}
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null) continue
    // Event handlers: store as marker for client-side mounting
    if (key.startsWith('on') && typeof value === 'function') {
      out[key] = value
      continue
    }
    // Signals: store the Signal itself (serialized later by page())
    if (value instanceof Signal || value instanceof Computed) {
      out[key] = value
      continue
    }
    out[key] = value
  }
  return out
}

function flatten(children: VChild[]): VChild[] {
  const result: VChild[] = []
  for (const child of children) {
    if (child == null || child === false) continue
    if (Array.isArray(child)) {
      result.push(...flatten(child))
    } else {
      result.push(child)
    }
  }
  return result
}

/**
 * Serialize a VNode tree to an HTML string.
 * Used by page() during SSR.
 */
export function serialize(node: VNode): string {
  const parts: string[] = []
  serializeNode(node, parts)
  return parts.join('')
}

function serializeNode(node: VNode | VChild, parts: string[]): void {
  // Primitive values
  if (typeof node === 'string') {
    parts.push(escapeHtml(node))
    return
  }
  if (typeof node === 'number' || typeof node === 'boolean') {
    parts.push(String(node))
    return
  }
  if (node == null) return

  // Signal/Computed — read current value
  if (node instanceof Signal || node instanceof Computed) {
    const val = node.value
    parts.push(escapeHtml(val == null ? '' : String(val)))
    return
  }

  // ShowNode — evaluate condition and render
  if ('_type' in node && node._type === 'show') {
    const show = node as ShowNode
    if (show.signal.peek()) {
      const result = show.factory()
      if (result) serializeNode(result, parts)
    }
    return
  }

  // EachNode — map array and render each
  if ('_type' in node && node._type === 'each') {
    const eachNode = node as EachNode
    const arr = eachNode.signal.peek()
    if (Array.isArray(arr)) {
      for (let i = 0; i < arr.length; i++) {
        const item = eachNode.factory(arr[i], i)
        serializeNode(item, parts)
      }
    }
    return
  }

  // Array — recurse
  if (Array.isArray(node)) {
    for (const child of node) {
      serializeNode(child, parts)
    }
    return
  }

  // VNode
  const { tag, attrs, children } = node
  parts.push('<', tag)

  if (attrs) {
    for (const [key, value] of Object.entries(attrs)) {
      if (value == null) continue

      // Event handlers — store as data attribute for client-side mounting
      if (key.startsWith('on') && typeof value === 'function') {
        const eventType = key.slice(2).toLowerCase()
        parts.push(` data-on${eventType}="true"`)
        continue
      }

      // Signal/Computed — read current value
      if (value instanceof Signal || value instanceof Computed) {
        const val = value.value
        if (typeof val === 'boolean') {
          if (val) parts.push(` ${key}`)
        } else {
          parts.push(` ${key}="${escapeHtml(String(val))}"`)
        }
        continue
      }

      // Boolean attributes
      if (typeof value === 'boolean') {
        if (value) parts.push(` ${key}`)
        continue
      }

      parts.push(` ${key}="${escapeHtml(String(value))}"`)
    }
  }

  // Void elements
  if (VOID_ELEMENTS.has(tag)) {
    parts.push(' />')
    return
  }

  parts.push('>')

  for (const child of children) {
    serializeNode(child, parts)
  }

  parts.push('</', tag, '>')
}

const VOID_ELEMENTS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr',
])

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
