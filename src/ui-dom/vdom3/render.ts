/**
 * vdom3 render — 渲染器（状态绑定 → DOM 指令 → 执行）
 *
 * 无整树 diff：节点是「状态绑定点」（TextBind 订阅 signal——变化只更新该文本）
 * 或「结构节点」（Show/For——局部插入/移除指令）。
 */

import type { V3Node, ElementNode, TextBind, StructNode } from './types.ts'
import { stream } from './events.ts'
import { effect } from './signal.ts'

let nodeUid = 0

function nextId(): string {
  return `v3n${++nodeUid}`
}

/** 渲染节点到父元素（返回首个 DOM 节点） */
export function renderNode(node: V3Node | null | undefined | boolean, parent: Node): Node | null {
  if (node == null || node === false || node === true) return null
  if (typeof node === 'string' || typeof node === 'number') {
    const t = document.createTextNode(String(node))
    parent.appendChild(t)
    return t
  }
  if (Array.isArray(node)) {
    let first: Node | null = null
    for (const c of node) {
      const n = renderNode(c, parent)
      if (n && !first) first = n
    }
    return first
  }
  switch (node.kind) {
    case 'text-bind': return renderTextBind(node, parent)
    case 'element': return renderElement(node, parent)
    case 'struct': return renderStruct(node, parent)
  }
}

/** 文本绑定点：effect 订阅——signal 变化 → 只更新本文本节点（无 diff） */
function renderTextBind(bind: TextBind, parent: Node): Node | null {
  const el = document.createTextNode(String(bind.fn()))
  bind.el = el
  parent.appendChild(el)
  // 订阅：effect 内读 signal → 依赖追踪 → 变化重跑（只更新此文本）
  effect(() => {
    const v = String(bind.fn())
    if (el.nodeValue !== v) {
      stream.emit({ type: 'DOM_UPDATE', target: nodeId(el), key: 'text', value: v, prev: el.nodeValue ?? '', ts: Date.now() })
      el.nodeValue = v
    }
  })
  return el
}

/** 元素：props（属性绑定点——函数值 = 动态属性） + children 递归 */
function renderElement(node: ElementNode, parent: Node): Node | null {
  const el = document.createElement(node.tag)
  node.el = el
  const id = nextId()
  el.setAttribute('data-v3-id', id)
  parent.appendChild(el)

  for (const [key, val] of Object.entries(node.props ?? {})) {
    if (key === 'children') continue
    if (typeof val === 'function') {
      // 动态属性：effect 订阅——变化 → 更新属性（只更新此属性）
      const fn = val as () => unknown
      effect(() => {
        const v = fn()
        if (key.startsWith('on') && key.length > 2 && /^on[A-Z]/.test(key)) {
          // 事件绑定：首次挂载（函数引用稳定——组件层保证）
          if (!(el as any).__v3evt) {
            const type = key.slice(2).toLowerCase()
            el.addEventListener(type, (e: Event) => (fn as any)(e))
            ;(el as any).__v3evt = type
          }
          return
        }
        const prev = el.getAttribute(key)
        if (String(v) !== prev) {
          stream.emit({ type: 'DOM_UPDATE', target: id, key, value: v, prev: prev ?? '', ts: Date.now() })
          el.setAttribute(key, String(v))
        }
      })
    } else if (val != null && val !== false) {
      el.setAttribute(key, String(val))
    }
  }
  for (const c of node.children ?? []) renderNode(c, el)
  return el
}

/** 结构节点：Show（条件插入/移除） / For（列表 keyed 局部 diff） */
function renderStruct(node: StructNode, parent: Node): Node | null {
  const anchor = document.createComment('v3-struct')
  parent.appendChild(anchor)
  node.el = anchor
  if (node.type === 'show') {
    effect(() => {
      const show = !!node.when?.()
      // 内容插在 anchor 前——用 previousSibling 判断（anchor 后是兄弟内容）
      const hasContent = node.el?.previousSibling != null
      if (show && !hasContent) {
        const n = renderNode(node.render?.() ?? null, parent)
        if (n) parent.insertBefore(n, anchor)
      } else if (!show && hasContent) {
        const n = node.el!.previousSibling!
        stream.emit({ type: 'DOM_REMOVE', parent: parentId(parent), node: nodeId(n), ts: Date.now() })
        n.parentNode?.removeChild(n)
      }
    })
  } else if (node.type === 'for') {
    // For：列表 keyed 局部 diff（只 diff 列表项——无整树比较）
    let items: Array<{ key: string; node: Node | null; fn: () => V3Node | null | undefined | boolean }> = []
    effect(() => {
      const list = node.each?.() ?? []
      const keys = list.map((it, i) => node.key ? String(node.key(it)) : String(i))
      const next: Array<{ key: string; node: Node | null; fn: () => V3Node | null | undefined | boolean }> = []
      for (let i = 0; i < keys.length; i++) {
        const k = keys[i]
        const existing = items.find((x) => x.key === k)
        if (existing) {
          next.push(existing)
        } else {
          const item = list[i]
          const fn = () => node.render?.(item, i) ?? null
          next.push({ key: k, node: null, fn })
        }
      }
      // 插入新增项（锚点前）
      for (const it of next) {
        if (!it.node) {
          const n = renderNode(it.fn(), parent)
          it.node = n
          if (n) parent.insertBefore(n, anchor)
          stream.emit({ type: 'DOM_INSERT', parent: parentId(parent), node: nodeId(n), ref: null, ts: Date.now() })
        }
      }
      // 移除消失项
      for (const it of items) {
        if (!next.find((x) => x.key === it.key) && it.node) {
          stream.emit({ type: 'DOM_REMOVE', parent: parentId(parent), node: nodeId(it.node), ts: Date.now() })
          it.node.parentNode?.removeChild(it.node)
        }
      }
      items = next
    })
  }
  return anchor
}

function nodeId(n: Node | null): string {
  if (!n) return 'null'
  if (n.nodeType === 1) return (n as Element).getAttribute('data-v3-id') ?? 'el'
  if (n.nodeType === 3) return 'text'
  return 'comment'
}

function parentId(p: Node): string {
  if (p.nodeType === 1) return (p as Element).getAttribute('data-v3-id') ?? 'parent'
  return 'parent'
}
