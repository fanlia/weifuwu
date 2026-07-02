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

/**
 * Create live DOM from a tagged template literal.
 *
 * Strategy:
 * 1. Build HTML string, replacing @click, :value, ?checked with markers
 * 2. Parse into DOM via <template>
 * 3. Collect markers in pass 1 (no DOM mutation)
 * 4. Apply bindings in pass 2-3
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

  const mutableStrings = [...strings]
  let result = ''

  for (let i = 0; i < mutableStrings.length; i++) {
    let chunk = mutableStrings[i]
    const v = values[i]
    const idx = registry.length

    if (i < values.length) {
      // ── Signal / Computed ──
      if (v instanceof Signal || v instanceof Computed) {
        const eventIdx = chunk.lastIndexOf('@')
        const bindIdx = chunk.lastIndexOf(':')
        const boolIdx = chunk.lastIndexOf('?')

        if (eventIdx >= 0) {
          const rest = chunk.slice(eventIdx + 1).replace(/="?$/, '').trim()
          if (rest) {
            registry.push({ type: 'event', data: v, eventName: rest })
            chunk = chunk.slice(0, eventIdx)
            result += chunk + ` __wui_ev_${idx}="`
            continue
          }
        }

        if (bindIdx >= 0) {
          const rest = chunk.slice(bindIdx + 1).replace(/="?$/, '').trim()
          if (rest) {
            registry.push({ type: 'attr', data: v, attrName: rest })
            chunk = chunk.slice(0, bindIdx)
            result += chunk + ` __wui_bind_${idx}="`
            continue
          }
        }

        if (boolIdx >= 0) {
          const rest = chunk.slice(boolIdx + 1).replace(/="?$/, '').trim()
          if (rest) {
            registry.push({ type: 'bool', data: v, attrName: rest })
            chunk = chunk.slice(0, boolIdx)
            result += chunk + ` __wui_bool_${idx}`
            if (mutableStrings[i + 1]?.startsWith('"')) mutableStrings[i + 1] = mutableStrings[i + 1].slice(1)
            continue
          }
        }

        registry.push({ type: 'ref', data: v })
        result += chunk + `<!--__wui_ref_${idx}-->`
        continue
      }

      // ── Function (event handler) ──
      if (typeof v === 'function') {
        const eventIdx = chunk.lastIndexOf('@')
        if (eventIdx >= 0) {
          const rest = chunk.slice(eventIdx + 1).replace(/="?$/, '').trim()
          if (rest) {
            registry.push({ type: 'event', data: v, eventName: rest })
            chunk = chunk.slice(0, eventIdx)
            result += chunk + ` __wui_ev_${idx}="`
            continue
          }
        }
      }

      // ── Node (nested html() call) ──
      if (v instanceof Node) {
        registry.push({ type: 'node', data: v })
        result += chunk + `<!--__wui_node_${idx}-->`
        continue
      }

      // ── Array of nodes ──
      if (Array.isArray(v)) {
        const items: Node[] = []
        for (const item of v) {
          if (item instanceof Node) items.push(item)
        }
        registry.push({ type: 'node', data: items })
        result += chunk + `<!--__wui_node_${idx}-->`
        continue
      }

      // ── Plain value ──
      const textContent = v == null || v === false ? '' : String(v)
      registry.push({ type: 'text', data: textContent })
      result += chunk + textContent
      continue
    }

    result += chunk
  }

  // ── Parse into DOM ──
  const template = document.createElement('template')
  template.innerHTML = result
  const root = template.content

  // ── Walker ──
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ALL, null)

  const refTargets: Array<{
    signal: Signal | Computed
    el: Text | HTMLElement
    getValue: () => string
  }> = []

  // ── Pass 1: Collect markers (no DOM mutation) ──
  const commentActions: Array<{ comment: Comment; idx: number }> = []
  const attrActions: Array<{ el: HTMLElement; idx: number; kind: 'ev' | 'bind' | 'bool' }> = []

  while (walker.nextNode()) {
    const node = walker.currentNode

    if (node.nodeType === Node.COMMENT_NODE) {
      const text = (node as Comment).data
      const refMatch = text.match(/^__wui_ref_(\d+)$/)
      const nodeMatch = text.match(/^__wui_node_(\d+)$/)
      if (refMatch) {
        commentActions.push({ comment: node as Comment, idx: parseInt(refMatch[1]) })
      } else if (nodeMatch) {
        const idx = parseInt(nodeMatch[1])
        const data = registry[idx]?.data
        if (data instanceof Node) {
          node.parentNode?.replaceChild(data, node)
        } else if (Array.isArray(data)) {
          const frag = document.createDocumentFragment()
          for (const n of data) frag.appendChild(n)
          node.parentNode?.replaceChild(frag, node)
        }
      }
    }

    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement
      for (let a = 0; a < el.attributes.length; a++) {
        const attr = el.attributes[a]
        const evMatch = attr.name.match(/^__wui_ev_(\d+)$/)
        const bindMatch = attr.name.match(/^__wui_bind_(\d+)$/)
        const boolMatch = attr.name.match(/^__wui_bool_(\d+)$/)
        if (evMatch) attrActions.push({ el, idx: parseInt(evMatch[1]), kind: 'ev' })
        if (bindMatch) attrActions.push({ el, idx: parseInt(bindMatch[1]), kind: 'bind' })
        if (boolMatch) attrActions.push({ el, idx: parseInt(boolMatch[1]), kind: 'bool' })
      }
    }
  }

  // ── Pass 2: Apply ref comments (replace with text node containing initial signal value) ──
  for (const { comment, idx } of commentActions) {
    const entry = registry[idx]
    if (entry?.data instanceof Signal || entry?.data instanceof Computed) {
      const sig = entry.data
      const initialVal = sig.value
      const textNode = document.createTextNode(initialVal == null ? '' : String(initialVal))
      comment.parentNode?.replaceChild(textNode, comment)
      refTargets.push({
        signal: sig,
        el: textNode,
        getValue: () => String(sig.value),
      })
    }
  }

  // ── Pass 3: Apply attribute actions ──
  const attrsToRemove: Map<HTMLElement, string[]> = new Map()
  for (const { el, idx, kind } of attrActions) {
    const entry = registry[idx]
    if (kind === 'ev' && entry?.type === 'event' && entry.eventName) {
      el.addEventListener(entry.eventName, entry.data as (e: Event) => void)
      const list = attrsToRemove.get(el) || []
      list.push(`__wui_ev_${idx}`)
      attrsToRemove.set(el, list)
    }
    if (kind === 'bind' && entry?.type === 'attr' && entry.attrName && (entry.data instanceof Signal || entry.data instanceof Computed)) {
      const sig = entry.data
      ;(el as unknown as Record<string, unknown>)[entry.attrName] = sig.value
      refTargets.push({
        signal: sig,
        el: el as unknown as Text,
        getValue: () => { (el as unknown as Record<string, unknown>)[entry.attrName!] = sig.value; return '' },
      })
      const list = attrsToRemove.get(el) || []
      list.push(`__wui_bind_${idx}`)
      attrsToRemove.set(el, list)
    }
    if (kind === 'bool' && entry?.type === 'bool' && entry.attrName && (entry.data instanceof Signal || entry.data instanceof Computed)) {
      const sig = entry.data
      if (sig.value) el.setAttribute(entry.attrName, '')
      else el.removeAttribute(entry.attrName)
      refTargets.push({
        signal: sig,
        el: el as unknown as Text,
        getValue: () => {
          if (sig.value) el.setAttribute(entry.attrName!, '')
          else el.removeAttribute(entry.attrName!)
          return ''
        },
      })
      const list = attrsToRemove.get(el) || []
      list.push(`__wui_bool_${idx}`)
      attrsToRemove.set(el, list)
    }
  }

  for (const [el, names] of attrsToRemove) {
    for (const name of names) {
      el.removeAttribute(name)
    }
  }

  // ── Set up reactive bindings ──
  if (refTargets.length > 0) {
    const signalMap = new Map<Signal | Computed, Array<{ el: Text | HTMLElement; getValue: () => string }>>()
    for (const t of refTargets) {
      if (!signalMap.has(t.signal)) signalMap.set(t.signal, [])
      signalMap.get(t.signal)!.push(t)
    }

    for (const [sig, targets] of signalMap) {
      const updater = () => {
        for (const t of targets) {
          t.getValue()
          if (t.el.nodeType === Node.TEXT_NODE) {
            const val = (sig as Signal).value
            t.el.textContent = val == null ? '' : String(val)
          }
        }
      }
      if (sig instanceof Signal) {
        sig._addSub(updater)
      }
    }
  }

  if (root.childNodes.length === 1) return root.childNodes[0]
  if (root.childNodes.length === 0) return document.createTextNode('')
  return root
}
