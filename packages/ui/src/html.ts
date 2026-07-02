/**
 * Client-side html() — reactive DOM from tagged template literals.
 *
 * Same API as server-side html(), but returns live DOM nodes with
 * event bindings (@click, @input, etc.) and reactive bindings (ref).
 *
 * Usage:
 *   html`<button @click="${handler}">${text}</button>`
 */

import { Signal, Computed } from './signal.ts'

type HtmlValue = string | number | boolean | null | undefined | HtmlValue[] | Node | Node[] | Signal | Computed

// ── Event directive pattern ──
// @click → on:click
// @input → on:input
// @keydown → on:keydown
const EVENT_RE = /^@(\w+)$/

// ── Bind directive pattern ──
// :value → bind:value
// :class → bind:class
// ?checked → bool:checked
const BIND_RE = /^:(\w+)$/
const BOOL_RE = /^\?(\w+)$/

/**
 * Create live DOM from a tagged template literal.
 *
 * Internally:
 * 1. Build HTML string with markers
 * 2. Parse into DOM via <template>
 * 3. Walk DOM, bind events and signals from registry
 */
export function html(
  strings: TemplateStringsArray,
  ...values: HtmlValue[]
): Node | Node[] {
  const registry: Array<{
    type: 'event' | 'text' | 'attr' | 'bool' | 'ref' | 'node'
    data: unknown
    eventName?: string
    attrName?: string
  }> = []

  let result = ''

  for (let i = 0; i < strings.length; i++) {
    result += strings[i]
    if (i < values.length) {
      const v = values[i]
      const idx = registry.length

      // Handle Signal / Computed
      if (v instanceof Signal || v instanceof Computed) {
        // Check if this value is inside an attribute (event or bind)
        const prev = strings[i]
        const eventMatch = prev.match(EVENT_RE)
        const bindMatch = prev.match(BIND_RE)
        const boolMatch = prev.match(BOOL_RE)

        if (eventMatch) {
          // @click with a ref — bind event
          const eventName = eventMatch[1]
          registry.push({ type: 'event', data: v, eventName })
          // Remove the @click="..." from the string
          // Actually, we've already added the attribute in the string.
          // We'll clean up during DOM processing.
          result += `__wui_ev_${idx}`
        } else if (bindMatch) {
          const attrName = bindMatch[1]
          registry.push({ type: 'attr', data: v, attrName })
          result += `__wui_bind_${idx}`
        } else if (boolMatch) {
          const attrName = boolMatch[1]
          registry.push({ type: 'bool', data: v, attrName })
          result += `__wui_bool_${idx}`
        } else {
          // Text content binding
          registry.push({ type: 'ref', data: v })
          result += `<!--__wui_ref_${idx}-->`
        }
        continue
      }

      // Handle function (event handler)
      if (typeof v === 'function') {
        const prev = strings[i]
        const eventMatch = prev.match(EVENT_RE)
        if (eventMatch) {
          const eventName = eventMatch[1]
          registry.push({ type: 'event', data: v, eventName })
          result += `__wui_ev_${idx}`
          continue
        }
      }

      // Handle Node (nested html() result or raw node)
      if (v instanceof Node) {
        registry.push({ type: 'node', data: v })
        result += `<!--__wui_node_${idx}-->`
        continue
      }

      if (Array.isArray(v)) {
        // Array of nodes or html results
        const items: Node[] = []
        for (const item of v) {
          if (item instanceof Node) items.push(item)
        }
        registry.push({ type: 'node', data: items })
        result += `<!--__wui_node_${idx}-->`
        continue
      }

      // Plain value (string, number, boolean, null)
      if (v == null || v === false) {
        registry.push({ type: 'text', data: '' })
        result += `<!--__wui_text_${idx}-->`
      } else {
        registry.push({ type: 'text', data: String(v) })
        result += `<!--__wui_text_${idx}-->`
      }
    }
  }

  // ── Parse into DOM ──
  const template = document.createElement('template')
  template.innerHTML = result
  const root = template.content

  // ── Walk DOM and apply registrations ──
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ALL, null)

  const refTargets: Array<{
    signal: Signal | Computed
    el: Text
    getValue: () => string
  }> = []

  const nodes: Node[] = []

  while (walker.nextNode()) {
    const node = walker.currentNode

    // ── Comment nodes: text/content placeholders ──
    if (node.nodeType === Node.COMMENT_NODE) {
      const text = (node as Comment).data
      const textMatch = text.match(/^__wui_text_(\d+)$/)
      const refMatch = text.match(/^__wui_ref_(\d+)$/)
      const nodeMatch = text.match(/^__wui_node_(\d+)$/)

      if (textMatch || refMatch) {
        const idx = parseInt(textMatch?.[1] ?? refMatch![1])
        const entry = registry[idx]
        const textNode = document.createTextNode('')
        node.parentNode?.replaceChild(textNode, node)
        if (refMatch && (entry.data instanceof Signal || entry.data instanceof Computed)) {
          refTargets.push({
            signal: entry.data as Signal | Computed,
            el: textNode,
            getValue: () => String((entry.data as Signal | Computed).value),
          })
        }
        continue
      }

      if (nodeMatch) {
        const idx = parseInt(nodeMatch[1])
        const entry = registry[idx]
        const data = entry.data
        if (data instanceof Node) {
          node.parentNode?.replaceChild(data, node)
          nodes.push(data)
        } else if (Array.isArray(data)) {
          const frag = document.createDocumentFragment()
          for (const n of data) {
            frag.appendChild(n)
          }
          node.parentNode?.replaceChild(frag, node)
          nodes.push(...data)
        }
        continue
      }
    }

    // ── Element nodes: event/attribute bindings ──
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement

      // Process attributes
      const attrsToRemove: string[] = []
      for (let a = 0; a < el.attributes.length; a++) {
        const attr = el.attributes[a]
        const evMatch = attr.name.match(/^__wui_ev_(\d+)$/)
        const bindMatch = attr.name.match(/^__wui_bind_(\d+)$/)
        const boolMatch = attr.name.match(/^__wui_bool_(\d+)$/)

        if (evMatch) {
          const idx = parseInt(evMatch[1])
          const entry = registry[idx]
          if (entry.type === 'event' && entry.eventName) {
            const handler = entry.data as (e: Event) => void
            el.addEventListener(entry.eventName, handler)
          }
          attrsToRemove.push(attr.name)
        }

        if (bindMatch) {
          const idx = parseInt(bindMatch[1])
          const entry = registry[idx]
          if (entry.type === 'attr' && entry.attrName && (entry.data instanceof Signal || entry.data instanceof Computed)) {
            const sig = entry.data as Signal | Computed
            ;(el as Record<string, unknown>)[entry.attrName] = sig.value
            refTargets.push({
              signal: sig,
              el: el as unknown as Text,
              getValue: () => {
                (el as Record<string, unknown>)[entry.attrName!] = sig.value
                return ''
              },
            })
          }
          attrsToRemove.push(attr.name)
        }

        if (boolMatch) {
          const idx = parseInt(boolMatch[1])
          const entry = registry[idx]
          if (entry.type === 'bool' && entry.attrName && (entry.data instanceof Signal || entry.data instanceof Computed)) {
            const signal = entry.data as Signal | Computed
            // Set initial value
            if (signal.value) el.setAttribute(entry.attrName, '')
            else el.removeAttribute(entry.attrName)
            // Create effect
            refTargets.push({
              signal,
              el: el as unknown as Text,
              getValue: () => {
                if (signal.value) el.setAttribute(entry.attrName, '')
                else el.removeAttribute(entry.attrName)
                return ''
              },
            })
          }
          attrsToRemove.push(attr.name)
        }
      }

      // Clean up marker attributes
      for (const name of attrsToRemove) {
        el.removeAttribute(name)
      }
    }
  }

  // ── Set up reactive bindings (one effect per signal to batch updates) ──
  if (refTargets.length > 0) {
    // Group by signal to avoid duplicate effects
    const signalMap = new Map<Signal | Computed, Array<{ el: Text; getValue: () => string }>>()
    for (const t of refTargets) {
      if (!signalMap.has(t.signal)) signalMap.set(t.signal, [])
      signalMap.get(t.signal)!.push(t)
    }

    // We need to create effects without importing the effect system directly
    // to avoid circular dependencies. We'll use a simple subscription approach.
    for (const [sig, targets] of signalMap) {
      const updater = () => {
        for (const t of targets) {
          t.getValue() // side effect happens inside getValue for attrs/bools
          // For text nodes, update the text content
          if (t.el.nodeType === Node.TEXT_NODE) {
            const val = (sig as Signal).value
            t.el.textContent = val == null ? '' : String(val)
          }
        }
      }
      // Subscribe directly
      if (sig instanceof Signal) {
        sig._addSub(updater)
      }
      // For Computed, we need to track — simplified for now
    }
  }

  // Return single child if possible
  if (root.childNodes.length === 1) return root.childNodes[0]
  if (root.childNodes.length === 0) return document.createTextNode('')
  // Return DocumentFragment
  return root
}
