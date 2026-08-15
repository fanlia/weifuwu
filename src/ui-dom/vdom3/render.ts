/**
 * vdom3 render — 渲染执行器：vnode 树 → 事件流 → DOM
 *
 * 核心：**渲染即事件**——树的每个节点创建/属性设置/插入都是事件（stream.emit），
 * 执行器消费事件操作 DOM。DOM = fold(事件流)。
 *
 * 更新（patch）：同位置同类型复用（vnode 身份）——仅变化部分发事件
 * （TEXT_UPDATE / PROP_UPDATE / 异类型 → REMOVE+CREATE+INSERT）——无整树 diff。
 */

import type { VNode, VNodeChild } from './types.ts'
import { Fragment } from './types.ts'
import { stream, nextNodeId } from './events.ts'

/** 挂载：vnode → 事件流 → DOM */
export function mount(vnode: VNode, root: HTMLElement): void {
  patch(null, vnode, root)
}

/**
 * patch：old vs new → 事件流 → DOM。
 * 复用规则（最小——非整树 diff）：
 *  - 同位置同类型（含 key）→ 递归 patch（仅属性/文本/子节点变化发事件）
 *  - 异类型/异 key → REMOVE + CREATE + INSERT（重建事件）
 *  - 列表：keyed 匹配（同 key 复用；新增 INSERT；消失 REMOVE）
 */
export function patch(oldV: VNode | null, newV: VNodeChild, parent: Node, anchor?: Node | null): Node | null {
  // 文本
  if (typeof newV === 'string' || typeof newV === 'number') {
    const str = String(newV)
    if (oldV == null || typeof oldV !== 'object') {
      // 旧节点非文本（或空）→ 创建文本
      const t = document.createTextNode(str)
      const id = nextNodeId()
      stream.emit({ type: 'TEXT_CREATE', id, value: str, ts: Date.now() })
      if (anchor && anchor.parentNode === parent) parent.insertBefore(t, anchor)
      else parent.appendChild(t)
      stream.emit({ type: 'INSERT', parent: parentId(parent), child: id, ref: anchor ? nodeId(anchor) : null, ts: Date.now() })
      return t
    }
    // 同类型文本 → 值变化更新（TEXT_UPDATE 事件）
    const el = oldV.el as Text
    if (el && el.nodeValue !== str) {
      stream.emit({ type: 'TEXT_UPDATE', target: nodeId(el), value: str, prev: el.nodeValue ?? '', ts: Date.now() })
      el.nodeValue = str
    }
    return el
  }
  if (newV == null || newV === false || newV === true) {
    if (oldV != null && oldV.el) {
      stream.emit({ type: 'REMOVE', parent: parentId(parent), child: nodeId(oldV.el), ts: Date.now() })
      oldV.el.parentNode?.removeChild(oldV.el)
      oldV.el = null
    }
    return null
  }

  // vnode 节点
  const vn = newV
  const sameType = oldV != null && typeof oldV === 'object' && oldV.type === vn.type && oldV.key === vn.key

  if (sameType && vn.type !== Fragment) {
    // 同类型复用：属性 diff + 子节点递归
    const el = oldV!.el as Element
    vn.el = el
    patchProps(el, oldV!.props, vn.props)
    patchChildren(oldV!, vn, el)
    return el
  }

  // 异类型 / 新节点 → 创建 + 插入
  const node = createNode(vn, parent)
  if (oldV != null && oldV.el && oldV.el.parentNode === parent) {
    stream.emit({ type: 'REMOVE', parent: parentId(parent), child: nodeId(oldV.el), ts: Date.now() })
    oldV.el.parentNode?.removeChild(oldV.el)
  }
  if (anchor && anchor.parentNode === parent) parent.insertBefore(node, anchor)
  else parent.appendChild(node)
  stream.emit({ type: 'INSERT', parent: parentId(parent), child: nodeId(node), ref: anchor ? nodeId(anchor) : null, ts: Date.now() })
  return node
}

/** 创建节点（vnode → DOM + 事件） */
function createNode(vn: VNode, parent: Node): Node {
  if (vn.type === Fragment) {
    const frag = document.createDocumentFragment()
    for (const c of vn.children ?? []) {
      const n = patch(null, c, frag)
      if (n) frag.appendChild(n)
    }
    return frag
  }
  const el = document.createElement(vn.type as string)
  const id = nextNodeId()
  el.setAttribute('data-v3-id', id)
  vn.el = el
  stream.emit({ type: 'NODE_CREATE', id, tag: vn.type as string, ts: Date.now() })
  // props（初始——事件流记录每个属性设置）
  for (const [key, val] of Object.entries(vn.props ?? {})) {
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
  for (const c of vn.children ?? []) {
    const n = patch(null, c, el)
    if (n) el.appendChild(n)
  }
  return el
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
    if (nv == null || nv === false) {
      el.removeAttribute(key)
    } else {
      el.setAttribute(key, String(nv))
    }
    stream.emit({ type: 'PROP_UPDATE', target, key, value: nv, prev: ov ?? '', ts: Date.now() })
  }
}

/** children diff：位置配对（childNodes 索引对齐——无整树比较）。
 *  文本特判：同位置文本节点更新 nodeValue（TEXT_UPDATE 事件——不重建）。
 *  false/null：不产生 DOM 节点（childNodes 与 children 对齐的前提——h 已过滤 false）。
 *  列表 keyed：见 patch 的 key 复用（同 key 递归——新增/移除事件）。 */
function patchChildren(oldV: VNode, newV: VNode, el: Element): void {
  const oldKids = oldV.children ?? []
  const newKids = newV.children ?? []
  const len = Math.max(oldKids.length, newKids.length)
  for (let i = 0; i < len; i++) {
    const oc = i < oldKids.length ? oldKids[i] : null
    const nc = i < newKids.length ? newKids[i] : null
    if (i >= newKids.length) {
      // 多余旧项 → 移除对应 DOM（childNodes 对齐——vnode 项有 el；文本项用索引）
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
      // 文本特判：定位同位置文本节点（childNodes[i]——children 对齐）
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
      // 新占位：移除同位置 DOM（若存在）
      const domNode = el.childNodes[i]
      if (domNode) domNode.parentNode?.removeChild(domNode)
      continue
    }
    if (oc != null && typeof oc === 'object') {
      patch(oc as VNode, nc as VNode, el)
    } else {
      patch(null, nc as VNode, el)
    }
  }
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
