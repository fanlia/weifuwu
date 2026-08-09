/**
 * weifuwu/ui-dom VDOM 渲染器 — 完全独立（不依赖 src/client）
 *
 * serveUI = VDOM（落地机制）：
 *   - renderValue(vnode) → Node：VNode 树 → 真实 DOM（挂载）
 *   - patchValue(parent, oldNode, oldVNode, newVNode) → Node：增量 diff 更新
 *
 * 简化但完整的实现：文本/元素/组件/Fragment 渲染 + 属性 diff + children diff。
 */

import type { VNode, VNodeChild } from './types.ts'

/** 渲染 VNode 树 → DOM 节点（挂载） */
export function renderValue(v: VNodeChild, ctx: any): Node | null {
  if (v == null || typeof v === 'boolean') return null
  if (typeof v === 'string' || typeof v === 'number') return document.createTextNode(String(v))
  if (Array.isArray(v)) {
    const frag = document.createDocumentFragment()
    for (const child of v) {
      const node = renderValue(child, ctx)
      if (node != null) frag.appendChild(node)
    }
    return frag
  }

  const vnode = v as VNode
  // 组件（两阶段：mount → render）
  if (typeof vnode.type === 'function') {
    return renderComponent(vnode.type, vnode, ctx)
  }
  // Fragment
  if (vnode.type === (Symbol.for('wf-fragment'))) {
    const frag = document.createDocumentFragment()
    for (const child of normalizeChildren(vnode.props?.children)) {
      const node = renderValue(child, ctx)
      if (node != null) frag.appendChild(node)
    }
    vnode._child = normalizeChildren(vnode.props?.children) as VNode[]
    return frag
  }
  // 原生元素
  const tag = vnode.type as string
  const el = document.createElement(tag)
  vnode.el = el
  // 属性
  for (const [key, value] of Object.entries(vnode.props ?? {})) {
    if (key === 'children' || key === 'key') continue
    setProp(el, key, value)
  }
  // children
  for (const child of normalizeChildren(vnode.props?.children)) {
    const node = renderValue(child, ctx)
    if (node != null) el.appendChild(node)
  }
  vnode._child = normalizeChildren(vnode.props?.children) as VNode[]
  return el
}

/** 渲染组件（两阶段：mount 返回 render 函数 → 调用产出 VNode）——支持组件级 $ 重渲染 */
function renderComponent(Comp: Function, vnode: VNode, ctx: any): Node | null {
  // 分配组件 id + 注册（组件级 $ 重渲染用）
  const registry = ctx?.__registry
  if (registry && !vnode._id) {
    vnode._id = registry.nextId()
    registry.set(vnode._id, vnode)
  }

  // 子 ctx：注入 _selfId/_selfVNode + 组件级 $（赋值 → dirty(id) → 重渲染）
  const childCtx = Object.create(ctx ?? {})
  childCtx._selfId = vnode._id
  childCtx._selfVNode = vnode
  if (registry && vnode._id) {
    // 组件级 $：dirty 本组件（区别于路由实例级 $——router 注入的 ctx.ui.$）
    // 覆盖 childCtx.ui.$——组件内 ctx.ui.$() 返回组件级状态
    const componentState = createComponentState(registry, vnode._id)
    childCtx.ui = {
      ...(ctx?.ui ?? {}),
      $: () => componentState,
    }
  }

  // mount（一次）：Comp(initProps, ctx) → render 函数
  const renderFn = (Comp as any)(vnode.props ?? {}, childCtx)
  if (typeof renderFn !== 'function') return null
  vnode._render = renderFn
  const childVNode = renderFn(vnode.props ?? {})
  if (childVNode == null) return null
  vnode._child = childVNode
  ;(vnode as any)._ctx = childCtx
  const node = renderValue(childVNode, childCtx)
  if (node) vnode._refNode = node
  return node
}

/** 增量 diff：新旧 VNode → 更新 DOM */
export function patchValue(
  parent: Node,
  oldNode: Node | null,
  oldVNode: VNodeChild,
  newVNode: VNodeChild,
  ctx: any,
): Node | null {
  // 新增
  if (oldVNode == null) {
    if (newVNode == null) return null
    const node = renderValue(newVNode, ctx)
    if (node == null) return null
    if (oldNode && oldNode.parentNode) {
      parent.insertBefore(node, oldNode)
    } else {
      parent.appendChild(node)
    }
    return node
  }
  // 移除
  if (newVNode == null) {
    if (oldNode && oldNode.parentNode) oldNode.parentNode.removeChild(oldNode)
    return null
  }
  // 文本替换
  const oldIsText = typeof oldVNode === 'string' || typeof oldVNode === 'number'
  const newIsText = typeof newVNode === 'string' || typeof newVNode === 'number'
  if (oldIsText || newIsText) {
    if (oldIsText && newIsText) {
      if (String(oldVNode) !== String(newVNode) && oldNode) {
        ;(oldNode as Text).textContent = String(newVNode)
      }
      return oldNode
    }
    const node = renderValue(newVNode, ctx)
    if (node && oldNode && oldNode.parentNode) oldNode.parentNode.replaceChild(node, oldNode)
    return node
  }
  // 数组（Fragment children）
  if (Array.isArray(oldVNode) || Array.isArray(newVNode)) {
    return patchChildren(parent, oldNode, oldVNode, newVNode, ctx)
  }

  const oldV = oldVNode as VNode
  const newV = newVNode as VNode

  // 组件：复用实例（同 type）→ 调 _render 或重新 mount
  if (typeof newV.type === 'function') {
    if (oldV.type === newV.type && oldV._render) {
      // 复用组件实例：调 render 产出新 VNode → 递归 diff
      newV._render = oldV._render
      newV._child = oldV._child
      const childNew = oldV._render(newV.props ?? {})
      newV._child = childNew
      if (childNew == null) {
        if (oldNode && oldNode.parentNode) oldNode.parentNode.removeChild(oldNode)
        return null
      }
      // 用旧节点的位置递归 patch
      const result = patchValue(parent, oldNode, oldV._child, childNew, ctx)
      return result ?? oldNode
    }
    // 不同组件：重新 mount
    const node = renderValue(newV, ctx)
    if (node && oldNode && oldNode.parentNode) oldNode.parentNode.replaceChild(node, oldNode)
    return node
  }

  // 元素：同 tag → patch props + children；不同 tag → 重建
  if (typeof oldV.type === 'string' && oldV.type === newV.type) {
    const el = oldNode as HTMLElement
    if (!el) return null
    newV.el = el
    // patch props
    patchProps(el, oldV.props, newV.props)
    // patch children（位置对齐）
    const oldChildren = normalizeChildren(oldV.props?.children)
    const newChildren = normalizeChildren(newV.props?.children)
    const len = Math.max(oldChildren.length, newChildren.length)
    for (let i = 0; i < len; i++) {
      const oldChildNode = el.childNodes[i] ?? null
      const result = patchValue(el, oldChildNode, oldChildren[i], newChildren[i], ctx)
      if (result && !el.contains(result)) el.insertBefore(result, oldChildNode?.nextSibling ?? null)
    }
    // 移除多余的旧节点
    while (el.childNodes.length > newChildren.length) {
      if (el.lastChild) el.removeChild(el.lastChild)
    }
    newV._child = newChildren as VNode[]
    return el
  }
  // 不同 tag：重建
  const node = renderValue(newV, ctx)
  if (node && oldNode && oldNode.parentNode) oldNode.parentNode.replaceChild(node, oldNode)
  return node
}

/** patch 属性（简化：移除缺失、设置新增/变化） */
function patchProps(el: HTMLElement, oldProps: Record<string, any>, newProps: Record<string, any>) {
  const oldKeys = oldProps ? Object.keys(oldProps).filter(k => k !== 'children' && k !== 'key') : []
  const newKeys = newProps ? Object.keys(newProps).filter(k => k !== 'children' && k !== 'key') : []
  const newKeySet = new Set(newKeys)
  // 移除旧属性
  for (const key of oldKeys) {
    if (!newKeySet.has(key)) {
      if (key.startsWith('on')) {
        el.removeEventListener(key.slice(2).toLowerCase(), oldProps[key])
      } else if (key === 'style') {
        el.removeAttribute('style')
      } else {
        el.removeAttribute(key)
      }
    }
  }
  // 设置新属性
  for (const key of newKeys) {
    const value = newProps[key]
    if (key.startsWith('on') && typeof value === 'function') {
      el.addEventListener(key.slice(2).toLowerCase(), value)
    } else if (key === 'style' && typeof value === 'object' && value !== null) {
      Object.assign(el.style, value)
    } else if (value === true) {
      el.setAttribute(key, '')
    } else if (value != null && value !== false) {
      el.setAttribute(key, String(value))
    }
  }
}

/** 设置单个属性（挂载路径） */
function setProp(el: HTMLElement, key: string, value: any) {
  if (key.startsWith('on') && typeof value === 'function') {
    el.addEventListener(key.slice(2).toLowerCase(), value)
  } else if (key === 'style' && typeof value === 'object' && value !== null) {
    Object.assign(el.style, value)
  } else if (value === true) {
    el.setAttribute(key, '')
  } else if (value != null && value !== false) {
    el.setAttribute(key, String(value))
  }
}

/** 展平 children（数组/单值） */
function normalizeChildren(children: any): VNodeChild[] {
  if (children == null) return []
  if (!Array.isArray(children)) return [children]
  const result: VNodeChild[] = []
  for (const c of children) {
    if (Array.isArray(c)) result.push(...c)
    else result.push(c)
  }
  return result
}

/** patch children（数组场景：位置对齐逐项 patch） */
function patchChildren(parent: Node, oldNode: Node | null, oldV: any, newV: any, ctx: any): Node | null {
  const oldChildren = Array.isArray(oldV) ? oldV : normalizeChildren(oldV)
  const newChildren = Array.isArray(newV) ? newV : normalizeChildren(newV)
  const len = Math.max(oldChildren.length, newChildren.length)
  let base = oldNode as ChildNode | null
  for (let i = 0; i < len; i++) {
    const refNode = base?.childNodes[i] ?? null
    const result = patchValue(base ?? parent, refNode, oldChildren[i], newChildren[i], ctx)
    if (result && base && !base.contains(result)) base.appendChild(result)
  }
  // 移除多余旧节点
  if (base) {
    while (base.childNodes.length > newChildren.length) if (base.lastChild) base.removeChild(base.lastChild)
  }
  return base
}

// ── 组件级响应式状态 ──────────────────────────────────

import { createReactiveState } from './reactive.ts'

/**
 * 组件级 $（D1）：赋值 → dirty(组件 id) → 调度重渲染该组件。
 * 与路由实例级 $（router 注入 ctx.ui.$）区分——组件自身的交互状态。
 */
function createComponentState(registry: any, componentId: string): Record<string, any> {
  return createReactiveState(() => {
    registry.markDirty(componentId)
  })
}

/**
 * 重渲染 dirty 组件（D1）：重调组件 render → 新 VNode → 局部 patch。
 * 由调度器（router 或测试）调用——drainDirty 后逐个处理。
 */
export function rerenderDirtyComponents(registry: any, _root: Node | null): void {
  const ids = registry.drainDirty()
  if (ids.length === 0) return
  registry.setRendering(true)
  try {
    for (const id of ids) {
      const vnode = registry.get(id)
      if (!vnode || !vnode._render) continue
      const oldChild = vnode._child as any
      const newChild = vnode._render(vnode.props ?? {})
      vnode._child = newChild
      // 用 refNode.parentNode 定位（组件可能嵌套在任意层级）
      const refNode = vnode._refNode ?? null
      const parent = refNode?.parentNode ?? (vnode as any)._parentNode ?? null
      if (!parent) continue
      const result = patchValue(parent, refNode, oldChild, newChild, (vnode as any)._ctx)
      if (result) vnode._refNode = result
    }
  } finally {
    registry.setRendering(false)
  }
}
