/**
 * vdom3 render — 渲染执行器：**构建后的纯树** → 事件流 → DOM
 *
 * 核心：**渲染即事件**——节点创建/属性设置/文本更新/插入/移除都是事件（stream.emit），
 * 执行器消费事件操作 DOM。DOM = fold(事件流)。
 *
 * 组件 vnode（已 build）：输出 _child（渲染组件输出——无重复构建）；
 * 卸载：COMP_UNMOUNT 事件（类型/位置变化时——由 patch 顶层判定）。
 */

import type { VNode, VNodeChild } from './types.ts'
import { Fragment } from './types.ts'
import { stream, nextNodeId } from './events.ts'

/** 挂载：纯树 → 事件流 → DOM */
export function mount(vnode: VNode, root: HTMLElement): void {
  renderVNode(vnode, root)
}

/** 渲染 vnode（同步——树已构建） */
function renderVNode(vnode: VNode, parent: Node, anchor?: Node | null): Node | null {
  // 组件：输出 _child（已构建——直接渲染输出；el 定位组件输出首节点）
  if (typeof vnode.type === 'function') {
    const output = vnode.children?.[0] ?? null
    if (output == null) return null
    if (vnode.el == null || !vnode.el.isConnected) {
      const node = renderVNode(output as VNode, parent, anchor)
      vnode.el = node
      return node
    }
    return vnode.el
  }
  if (vnode.type === Fragment) {
    let first: Node | null = null
    for (const c of vnode.children ?? []) {
      const n = renderVNodeChild(c, parent, anchor)
      if (n && !first) first = n
    }
    return first
  }
  // native
  const el = document.createElement(vnode.type as string)
  const id = nextNodeId()
  el.setAttribute('data-v3-id', id)
  vnode.el = el
  stream.emit({ type: 'NODE_CREATE', id, tag: vnode.type as string, ts: Date.now() })
  for (const [key, val] of Object.entries(vnode.props ?? {})) {
    if (key === 'key' || key === 'children') continue
    if (typeof val === 'function' && /^on[A-Z]/.test(key)) {
      el.addEventListener(key.slice(2).toLowerCase(), (e) => (val as any)(e))
      continue
    }
    if (val != null && val !== false) {
      el.setAttribute(key, String(val))
      stream.emit({ type: 'PROP_UPDATE', target: id, key, value: val, prev: '', ts: Date.now() })
    }
  }
  if (anchor && anchor.parentNode === parent) parent.insertBefore(el, anchor)
  else parent.appendChild(el)
  stream.emit({ type: 'INSERT', parent: parentId(parent), child: id, ref: anchor ? nodeId(anchor) : null, ts: Date.now() })
  for (const c of vnode.children ?? []) renderVNodeChild(c, el)
  return el
}

function renderVNodeChild(c: VNodeChild, parent: Node, anchor?: Node | null): Node | null {
  if (c == null || c === false || c === true) return null
  if (typeof c === 'string' || typeof c === 'number') {
    const t = document.createTextNode(String(c))
    const id = nextNodeId()
    stream.emit({ type: 'TEXT_CREATE', id, value: String(c), ts: Date.now() })
    if (anchor && anchor.parentNode === parent) parent.insertBefore(t, anchor)
    else parent.appendChild(t)
    stream.emit({ type: 'INSERT', parent: parentId(parent), child: id, ref: anchor ? nodeId(anchor) : null, ts: Date.now() })
    return t
  }
  return renderVNode(c, parent, anchor)
}

/**
 * patch：旧树（纯）vs 新树（纯）→ 事件流 → DOM。
 * 同位置同类型（含 key）复用——仅变化发事件；异类型 → REMOVE+CREATE+INSERT（重建事件）。
 */
export function patch(oldV: VNode | null, newV: VNodeChild, parent: Node, anchor?: Node | null): Node | null {
  // 文本
  if (typeof newV === 'string' || typeof newV === 'number') {
    const str = String(newV)
    const existing = oldV && typeof oldV === 'object' ? oldV.el : (parent.childNodes[0] ?? null)
    if (existing && existing.nodeType === 3) {
      if (existing.nodeValue !== str) {
        stream.emit({ type: 'TEXT_UPDATE', target: nodeId(existing), value: str, prev: existing.nodeValue ?? '', ts: Date.now() })
        existing.nodeValue = str
      }
      return existing
    }
    const t = document.createTextNode(str)
    const id = nextNodeId()
    stream.emit({ type: 'TEXT_CREATE', id, value: str, ts: Date.now() })
    if (anchor && anchor.parentNode === parent) parent.insertBefore(t, anchor)
    else parent.appendChild(t)
    stream.emit({ type: 'INSERT', parent: parentId(parent), child: id, ref: anchor ? nodeId(anchor) : null, ts: Date.now() })
    return t
  }
  if (newV == null || newV === false || newV === true) {
    if (oldV != null && oldV.el && oldV.el.parentNode === parent) {
      stream.emit({ type: 'REMOVE', parent: parentId(parent), child: nodeId(oldV.el), ts: Date.now() })
      oldV.el.parentNode?.removeChild(oldV.el)
    }
    return null
  }
  // vnode
  const vn = newV
  const oldIsVNode = oldV != null && typeof oldV === 'object' && 'type' in oldV
  const sameType = oldIsVNode && (oldV as VNode).type === vn.type && (oldV as VNode).key === vn.key

  if (sameType) {
    const ov = oldV as VNode
    // 组件：复用实例（_render 保持）——输出已由 build 更新（新 _child）——渲染新输出
    if (typeof vn.type === 'function') {
      vn._render = ov._render
      vn._id = ov._id
      const out = vn.children?.[0] ?? null
      const oldOut = ov.children?.[0] ?? null
      if (out == null) {
        if (ov.el) { ov.el.parentNode?.removeChild(ov.el); ov.el = null }
        vn.el = null
        return null
      }
      if (ov.el == null || !ov.el.isConnected) {
        vn.el = renderVNode(vn, parent, anchor)
      } else {
        // 组件输出变化 → patch 子树（组件 el 保持——输出首节点定位）
        patch(oldOut as VNode | null, out as VNodeChild, parent, anchor)
        vn.el = ov.el
      }
      return vn.el
    }
    // native：属性 diff + children patch
    const el = ov.el as Element
    vn.el = el
    patchProps(el, ov.props, vn.props)
    patchChildren(ov, vn, el)
    return el
  }

  // 异类型：旧组件 → COMP_UNMOUNT；移除旧 + 渲染新
  if (oldIsVNode && typeof (oldV as VNode).type === 'function' && (oldV as VNode)._id) {
    stream.emit({ type: 'COMP_UNMOUNT', id: (oldV as VNode)._id!, name: compName((oldV as VNode).type), ts: Date.now() })
  }
  if (oldIsVNode) {
    const oldEl = (oldV as VNode).el
    if (oldEl && oldEl.parentNode === parent) {
      stream.emit({ type: 'REMOVE', parent: parentId(parent), child: nodeId(oldEl), ts: Date.now() })
      oldEl.parentNode?.removeChild(oldEl)
    }
  }
  return renderVNode(vn, parent, anchor)
}

/** 属性 diff（同类型复用——仅变化发事件） */
function patchProps(el: Element, oldProps: Record<string, unknown>, newProps: Record<string, unknown>): void {
  const target = nodeId(el)
  const allKeys = new Set([...Object.keys(oldProps ?? {}), ...Object.keys(newProps ?? {})])
  for (const key of allKeys) {
    if (key === 'key' || key === 'children') continue
    const ov = oldProps?.[key]
    const nv = newProps?.[key]
    if (ov === nv) continue
    if (typeof nv === 'function' && /^on[A-Z]/.test(key)) {
      if (!(el as any).__v3evt) {
        el.addEventListener(key.slice(2).toLowerCase(), (e) => (nv as any)(e))
        ;(el as any).__v3evt = key
      }
      continue
    }
    if (nv == null || nv === false) el.removeAttribute(key)
    else el.setAttribute(key, String(nv))
    stream.emit({ type: 'PROP_UPDATE', target, key, value: nv, prev: ov ?? '', ts: Date.now() })
  }
}

/** children diff：位置配对（childNodes 索引对齐）；文本特判；keyed 列表复用 */
function patchChildren(oldV: VNode, newV: VNode, el: Element): void {
  const oldKids = oldV.children ?? []
  const newKids = newV.children ?? []
  const len = Math.max(oldKids.length, newKids.length)
  for (let i = 0; i < len; i++) {
    const oc = i < oldKids.length ? oldKids[i] : null
    const nc = i < newKids.length ? newKids[i] : null
    if (i >= newKids.length) {
      if (oc != null && typeof oc === 'object' && (oc as VNode).el) {
        const elNode = (oc as VNode).el!
        stream.emit({ type: 'REMOVE', parent: nodeId(el), child: nodeId(elNode), ts: Date.now() })
        elNode.parentNode?.removeChild(elNode)
      } else {
        const domNode = el.childNodes[i]
        if (domNode) domNode.parentNode?.removeChild(domNode)
      }
      continue
    }
    if (typeof nc === 'string' || typeof nc === 'number') {
      const str = String(nc)
      const existing = el.childNodes[i]
      if (existing && existing.nodeType === 3) {
        if (existing.nodeValue !== str) {
          stream.emit({ type: 'TEXT_UPDATE', target: nodeId(existing), value: str, prev: existing.nodeValue ?? '', ts: Date.now() })
          existing.nodeValue = str
        }
      } else {
        const t = document.createTextNode(str)
        const id = nextNodeId()
        stream.emit({ type: 'TEXT_CREATE', id, value: str, ts: Date.now() })
        el.insertBefore(t, el.childNodes[i] ?? null)
        stream.emit({ type: 'INSERT', parent: nodeId(el), child: id, ref: null, ts: Date.now() })
      }
      continue
    }
    if (nc == null || nc === false || nc === true) {
      const domNode = el.childNodes[i]
      if (domNode) domNode.parentNode?.removeChild(domNode)
      continue
    }
    if (oc != null && typeof oc === 'object') {
      patch(oc as VNode, nc as VNode, el)
    } else {
      // 新项：渲染（组件输出已在 build 展开）
      renderVNode(nc as VNode, el)
    }
  }
}

function compName(type: unknown): string {
  return typeof type === 'function' ? (type.name || 'anonymous') : String(type)
}

function nodeId(n: Node | null): string {
  if (!n) return 'null'
  if (n.nodeType === 1) return (n as Element).getAttribute('data-v3-id') ?? 'el'
  if (n.nodeType === 3) return 'text'
  return 'comment'
}

function parentId(p: Node): string {
  if (p.nodeType === 1) return (p as Element).getAttribute('data-v3-id') ?? 'root'
  return 'root'
}

export { Fragment }
