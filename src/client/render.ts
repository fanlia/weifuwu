/**
 * weifuwu/client 渲染器 — VNode → DOM + patchValue diff
 *
 * render(vnode, ctx)      → 首次渲染，返回 DOM
 * patchValue(el, old, new, ctx) → 增量更新
 *
 * 支持：
 *   - key 属性（keyed diff）
 *   - ref 回调（挂载/卸载）
 *   - ctx.ui.$ 持久化状态
 *   - ctx.ui.ready 首次执行标记
 */

import { Fragment } from './vnode.ts'
import type { VNode, Component } from './vnode.ts'
import type { WfuiContext } from './types.ts'

// ── render ─────────────────────────────────────────────

export function render(input: any, ctx: WfuiContext): Node {
  return renderValue(input, ctx)
}

function renderValue(v: any, ctx: WfuiContext): Node {
  if (v == null || typeof v === 'boolean') return document.createTextNode('')
  if (typeof v === 'string' || typeof v === 'number') return document.createTextNode(String(v))
  if (Array.isArray(v)) return renderArray(v, ctx)

  const vnode = v as VNode

  // Fragment
  if (vnode.type === Fragment) {
    const frag = document.createDocumentFragment()
    forEach(vnode.props?.children, child => frag.appendChild(renderValue(child, ctx)))
    return frag
  }

  // Component
  if (typeof vnode.type === 'function') {
    return renderComponent(vnode.type as Component, vnode.props, vnode, ctx)
  }

  // Native element
  const el = document.createElement(vnode.type as string)
  vnode.el = el

  for (const [key, value] of Object.entries(vnode.props ?? {})) {
    if (key === 'children' || key === 'key' || key === 'ref') continue
    setProp(el, key, value)
  }

  // 展平嵌套数组：JSX 中 {arr.map(...)} 产生 [el, [a,b,c]] 结构
  const flatChildren = flattenChildren(vnode.props?.children)
  for (const child of flatChildren) {
    el.appendChild(renderValue(child, ctx))
  }

  // ref 回调（挂载）
  if (vnode.props?.ref) {
    queueMicrotask(() => vnode.props.ref(el))
  }

  return el
}

function renderComponent(Comp: Component, props: any, vnode: VNode, ctx: WfuiContext): Node {
  // ctx.ui.$ 始终是 Proxy（由 app.ts 管理），不替换
  // vnode._$ 用于状态持久化跨 render 保持引用
  const prev$ = vnode._$
  if (!prev$) vnode._$ = {}
  ;(ctx as any).ui = (ctx as any).ui ?? {}
  ;(ctx as any).ui.ready = !!prev$

  let childVNode
  try {
    childVNode = Comp(props, ctx)
  } catch (e) {
    // 触发 ErrorBoundary（如果存在）
    const errHandler = (ctx as any).ui?._errorHandler
    if (errHandler) {
      errHandler(e)
      childVNode = null
    } else {
      console.error('Component render error:', e)
      childVNode = null
    }
  }
  if (childVNode == null) {
    vnode._child = null
    return document.createTextNode('')
  }
  vnode._child = childVNode
  return renderValue(childVNode, ctx)
}

function renderArray(arr: any[], ctx: WfuiContext): DocumentFragment {
  const frag = document.createDocumentFragment()
  for (const item of arr) frag.appendChild(renderValue(item, ctx))
  return frag
}

function forEach(children: any, fn: (child: any) => void) {
  if (children == null) return
  if (Array.isArray(children)) { children.forEach(fn); return }
  fn(children)
}

/** 展平嵌套数组 */
function flattenChildren(children: any): any[] {
  if (children == null) return []
  if (!Array.isArray(children)) return [children]
  const result: any[] = []
  for (const child of children) {
    if (Array.isArray(child)) {
      result.push(...child)
    } else {
      result.push(child)
    }
  }
  return result
}

// ── setProp ────────────────────────────────────────────

function setProp(el: Element, key: string, value: any) {
  if (key === 'class' || key === 'className') {
    el.className = String(value ?? '')
  } else if (key === 'style' && typeof value === 'object' && value !== null) {
    Object.assign((el as HTMLElement).style, value)
  } else if (key.startsWith('on') && typeof value === 'function') {
    el.addEventListener(key.slice(2).toLowerCase(), value as EventListener)
  } else if (key === 'value' && (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) {
    ;(el as HTMLInputElement).value = String(value ?? '')
  } else if (value === true) {
    el.setAttribute(key, '')
  } else if (value != null && value !== false) {
    el.setAttribute(key, String(value))
  }
}

// ── patchValue ─────────────────────────────────────────

export function patchValue(
  parent: Node,
  oldNode: Node | null,
  oldInput: any,
  newInput: any,
  ctx: WfuiContext,
): Node | null {
  // 新增
  if (oldInput == null) {
    if (newInput == null) return null
    const node = renderValue(newInput, ctx)
    if (oldNode && oldNode.parentNode) {
      oldNode.parentNode.insertBefore(node, oldNode)
    } else {
      parent.appendChild(node)
    }
    return node
  }

  // 删除
  if (newInput == null) {
    if (oldNode) {
      callRef(oldInput, null)
      ;(oldNode as ChildNode).remove()
    }
    return null
  }

  const oldType = typeOf(oldInput)
  const newType = typeOf(newInput)

  // 类型不同 → 替换
  if (oldType !== newType) {
    callRef(oldInput, null)
    const node = renderValue(newInput, ctx)
    if (oldNode?.parentNode) {
      oldNode.parentNode.replaceChild(node, oldNode)
    }
    return node
  }

  // 文本
  if (newType === 'text') {
    if (oldNode && oldNode.textContent !== String(newInput)) {
      oldNode.textContent = String(newInput)
    }
    return oldNode
  }

  const newV = newInput as VNode
  const oldV = oldInput as VNode

  // 组件 — 传递 ctx.ui.$
  if (typeof newV.type === 'function') {
    const comp = newV.type as Component

    // 传递 $ 状态（ctx.ui.$ 始终是 Proxy，不替换）
    if (oldV._$) newV._$ = oldV._$
    ;(ctx as any).ui = (ctx as any).ui ?? {}
    ;(ctx as any).ui.ready = !!newV._$

    const childNew = comp(newV.props, ctx)
    newV._child = childNew

    return patchValue(parent, oldNode, oldV._child, childNew, ctx)
  }

  // Fragment
  if (newV.type === Fragment) {
    patchChildren(parent, oldV, newV, ctx)
    return oldNode
  }

  // Native element
  if (typeof newV.type === 'string') {
    if (oldNode && oldNode.nodeType === 1) {
      patchProps(oldNode as Element, oldV.props, newV.props)
      patchChildren(oldNode, oldV, newV, ctx)
    } else if (oldNode) {
      // oldNode 不是元素节点 → 替换
      callRef(oldInput, null)
      const node = renderValue(newInput, ctx)
      oldNode.parentNode?.replaceChild(node, oldNode)
      return node
    }
    return oldNode
  }

  // Array（map 结果等）
  if (Array.isArray(newInput)) {
    const oldArr = Array.isArray(oldInput) ? oldInput : []
    patchSimpleChildren(parent, oldArr, newInput, ctx)
    return oldNode
  }

  return oldNode
}

// ── typeOf ─────────────────────────────────────────────

function typeOf(input: any): string {
  if (input == null || typeof input === 'boolean') return 'null'
  if (typeof input === 'string' || typeof input === 'number') return 'text'
  if (Array.isArray(input)) return 'array'
  const v = input as VNode
  if (typeof v.type === 'function') return `fn:${v.type.name || 'anon'}`
  if (v.type === Fragment) return 'fragment'
  if (typeof v.type === 'string') return 'tag:' + v.type
  return 'unknown'
}

// ── patchProps ─────────────────────────────────────────

function patchProps(el: Element, oldProps: any, newProps: any) {
  const oldKeys = oldProps ? Object.keys(oldProps).filter(k => k !== 'children' && k !== 'key' && k !== 'ref') : []
  const newKeys = newProps ? Object.keys(newProps).filter(k => k !== 'children' && k !== 'key' && k !== 'ref') : []

  for (const key of oldKeys) {
    if (!newKeys.includes(key)) {
      if (key === 'value' && (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) {
        ;(el as HTMLInputElement).value = ''
      } else {
        el.removeAttribute(key === 'className' ? 'class' : key)
      }
    }
  }

  for (const key of newKeys) {
    const oldVal = oldProps?.[key]
    const newVal = newProps?.[key]
    if (newVal !== oldVal) {
      if (key === 'class' || key === 'className') {
        el.className = String(newVal ?? '')
      } else if (key === 'style' && typeof newVal === 'object') {
        Object.assign((el as HTMLElement).style, newVal)
      } else if (key.startsWith('on') && typeof newVal === 'function') {
        const eventName = key.slice(2).toLowerCase()
        // 移除旧监听器，防止累积
        if (typeof oldVal === 'function') el.removeEventListener(eventName, oldVal as EventListener)
        el.addEventListener(eventName, newVal as EventListener)
      } else if (key === 'value' && (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) {
        ;(el as HTMLInputElement).value = String(newVal ?? '')
      } else if (newVal === true) {
        el.setAttribute(key, '')
      } else if (newVal != null && newVal !== false) {
        el.setAttribute(key, String(newVal))
      } else {
        if (key === 'value' && (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) {
          ;(el as HTMLInputElement).value = ''
        } else {
          el.removeAttribute(key)
        }
      }
    }
  }
}

// ── patchChildren ──────────────────────────────────────

function getKey(input: any): string | undefined {
  if (input == null || typeof input !== 'object') return undefined
  return (input as VNode).key
}

function patchChildren(parent: Node, oldVNode: VNode, newVNode: VNode, ctx: WfuiContext) {
  const oldChildren = normalize(oldVNode.props?.children)
  const newChildren = normalize(newVNode.props?.children)

  // 检查是否有 key
  const hasKey = newChildren.some(c => getKey(c) !== undefined)

  if (hasKey) {
    patchKeyedChildren(parent, oldChildren, newChildren, ctx)
  } else {
    patchSimpleChildren(parent, oldChildren, newChildren, ctx)
  }
}

function normalize(children: any): any[] {
  if (children == null) return []
  if (!Array.isArray(children)) return [children]
  // 展平嵌套数组：JSX 中 {arr.map(...)} 产生 [el, [a,b,c]] 结构
  const result: any[] = []
  for (const child of children) {
    if (Array.isArray(child)) {
      result.push(...child)
    } else {
      result.push(child)
    }
  }
  return result
}

function patchSimpleChildren(parent: Node, oldChildren: any[], newChildren: any[], ctx: WfuiContext) {
  const max = Math.max(oldChildren.length, newChildren.length)
  for (let i = 0; i < max; i++) {
    const oldChild = oldChildren[i]
    const newChild = newChildren[i]
    const existingNode = parent.childNodes[i] || null

    if (oldChild === undefined && newChild !== undefined) {
      const node = renderValue(newChild, ctx)
      parent.appendChild(node)
    } else if (newChild === undefined) {
      if (existingNode) {
        callRef(oldChild, null)
        existingNode.remove()
      }
    } else {
      patchValue(parent, existingNode, oldChild, newChild, ctx)
    }
  }
}

function patchKeyedChildren(parent: Node, oldChildren: any[], newChildren: any[], ctx: WfuiContext) {
  // Build old key map
  const oldKeyMap = new Map<string, { vnode: any; node: Node | null }>()
  for (let i = 0; i < oldChildren.length; i++) {
    const key = getKey(oldChildren[i])
    if (key !== undefined) {
      oldKeyMap.set(key, { vnode: oldChildren[i], node: parent.childNodes[i] || null })
    }
  }

  // Remove vanished keys
  const newKeys = newChildren.map(c => getKey(c))
  for (const key of oldKeyMap.keys()) {
    if (!newKeys.includes(key)) {
      const entry = oldKeyMap.get(key)!
      callRef(entry.vnode, null)
      ;(entry.node as ChildNode)?.remove()
      oldKeyMap.delete(key)
    }
  }

  // 移除无 key 的旧子节点（从有 key 切换过来时）
  for (let i = oldChildren.length - 1; i >= 0; i--) {
    const key = getKey(oldChildren[i])
    if (key === undefined) {
      const node = parent.childNodes[i]
      if (node) { callRef(oldChildren[i], null); (node as ChildNode).remove() }
    }
  }

  // Reorder / insert / replace
  let insertBefore: Node | null = parent.firstChild
  for (let i = newChildren.length - 1; i >= 0; i--) {
    const key = newKeys[i]
    const newChild = newChildren[i]
    const oldEntry = key !== undefined ? oldKeyMap.get(key) : undefined

    if (oldEntry && oldEntry.node) {
      // 同 key → 移动 DOM 节点
      parent.insertBefore(oldEntry.node, insertBefore)
      insertBefore = oldEntry.node
      // 同时 patch 内容（props 可能变了）
      patchValue(parent, oldEntry.node, oldEntry.vnode, newChild, ctx)
    } else {
      // 新 key → 插入
      const node = renderValue(newChild, ctx)
      parent.insertBefore(node, insertBefore)
      insertBefore = node
    }
  }
}

/** 浅比较两个 props 对象，跳过 children/key/ref */
function propsEqual(a: any, b: any): boolean {
  if (a === b) return true
  if (!a || !b) return false
  const aKeys = Object.keys(a).filter(k => k !== 'children' && k !== 'key' && k !== 'ref')
  const bKeys = Object.keys(b).filter(k => k !== 'children' && k !== 'key' && k !== 'ref')
  if (aKeys.length !== bKeys.length) return false
  for (const key of aKeys) {
    if (a[key] !== b[key]) return false
  }
  return true
}

// ── ref 回调 ───────────────────────────────────────────

function callRef(input: any, el: Node | null) {
  if (input == null || typeof input !== 'object') return
  const vnode = input as VNode
  if (typeof vnode.props?.ref === 'function') {
    vnode.props.ref(el)
  }
  // 递归子节点
  forEach(vnode.props?.children, child => callRef(child, el))
}

// ── 挂载到容器 ────────────────────────────────────────

export function mountVNode(container: Element, vnode: VNode, ctx: WfuiContext) {
  container.innerHTML = ''
  const node = renderValue(vnode, ctx)
  if (node instanceof Node) container.appendChild(node)
  else if (Array.isArray(node)) (node as any[]).forEach(n => container.appendChild(n))
}
