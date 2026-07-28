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

import { Fragment, Portal, isPortal } from './vnode.ts'
import type { VNode, Component } from './vnode.ts'
import type { WfuiContext } from './types.ts'

// render 执行中计数器 — >0 时 dirty() 被跳过，防止 render 中写 $ 导致死循环
let _renderCount = 0

// ── 深层 Proxy 包装（数组突变 + 嵌套对象属性自动 dirty）──

const mutationMethods = ['push', 'pop', 'splice', 'shift', 'unshift', 'sort', 'reverse']
const wrappedCache = new WeakMap<object, object>()

/** 创建响应式 Proxy handler——所有分支复用同一逻辑 */
function makeProxyHandler(dirty: () => void): ProxyHandler<object> {
  const isSkip = (k: PropertyKey): boolean => typeof k === 'string' && k.startsWith('_')

  return {
    get(target, key, receiver) {
      // _ 前缀返回 raw 值，不包装
      if (isSkip(key)) return Reflect.get(target, key, receiver)

      const v = Reflect.get(target, key, receiver)
      // 数组变异方法自动 dirty
      if (typeof key === 'string' && mutationMethods.includes(key) && typeof v === 'function') {
        return function (this: any, ...args: any[]) {
          const r = v.apply(target, args)
          dirty()
          return r
        }
      }
      return wrapDeep(v, dirty)
    },
    set(target, key, v) {
      const old = Reflect.get(target, key)
      if (old === v) return true  // 相同引用跳过 dirty
      Reflect.set(target, key, isSkip(key) ? v : wrapDeep(v, dirty))
      if (!isSkip(key)) dirty()
      return true
    },
  }
}

function wrapDeep(val: any, dirty: () => void): any {
  if (val === null || typeof val !== 'object') return val
  if (val instanceof Node) return val
  if (typeof Blob !== 'undefined' && val instanceof Blob) return val
  if (wrappedCache.has(val)) return wrappedCache.get(val)

  const proxy = new Proxy(val, makeProxyHandler(dirty))
  wrappedCache.set(val, proxy)
  return proxy
}

function createComponentProxy(target: Record<string, any>, dirty: () => void): Record<string, any> {
  return new Proxy(target, makeProxyHandler(dirty)) as Record<string, any>
}

// ── render ─────────────────────────────────────────────

export function render(input: any, ctx: WfuiContext): Node {
  return renderValue(input, ctx)
}

function renderValue(v: any, ctx: WfuiContext): Node {
  if (v == null || typeof v === 'boolean') return document.createTextNode('')
  if (typeof v === 'string' || typeof v === 'number') return document.createTextNode(String(v))
  if (Array.isArray(v)) return renderArray(v, ctx)

  const vnode = v as VNode

  // Portal — 渲染到 document.body#__wf_portal
  if (vnode.type === Portal) {
    return renderPortal(vnode, ctx)
  }

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

  // ref 回调（挂载）— 支持返回清理函数
  if (vnode.props?.ref) {
    const result = vnode.props.ref(el)
    if (typeof result === 'function') vnode._cleanup = result
  }

  return el
}

function renderComponent(Comp: Component, props: any, vnode: VNode, ctx: WfuiContext): Node {
  // 组件级 $ — 每个组件独立状态
  // vnode._$ 作为组件自己的状态存储
  const prev$ = vnode._$
  if (!prev$) vnode._$ = {}
  ;(ctx as any).ui = (ctx as any).ui ?? {}
  ;(ctx as any).ui.ready = !!prev$
  // 组件级 Proxy（深层包装：数组 push/pop 自动 dirty，嵌套对象赋值自动 dirty）
  const _target = vnode._$!
  const _dirtyFn = () => { if (_renderCount > 0) return; (ctx as any).ui?.dirty?.() }
  ;(ctx as any).ui.$ = createComponentProxy(_target, _dirtyFn)

  let childVNode
  _renderCount++
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
  } finally {
    _renderCount--
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

// ── Portal ────────────────────────────────────────────

/** 获取/创建全局 Portal 容器（document.body 下） */
function ensurePortalContainer(): HTMLDivElement {
  let c = document.getElementById('__wf_portal') as HTMLDivElement | null
  if (!c) {
    c = document.createElement('div')
    c.id = '__wf_portal'
    c.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:9999'
    document.body.appendChild(c)
  }
  return c
}

/** 首次渲染 Portal：创建子容器、渲染子节点、返回占位文本节点 */
function renderPortal(vnode: VNode, ctx: WfuiContext): Node {
  const container = ensurePortalContainer()
  const sub = document.createElement('div')
  sub.style.pointerEvents = 'auto'
  container.appendChild(sub)
  vnode._portalEl = sub

  const children = normalize(vnode.props?.children)
  vnode._child = children
  for (const child of children) {
    sub.appendChild(renderValue(child, ctx))
  }

  // 占位节点（父级树中的锚点）
  const placeholder = document.createTextNode('')
  vnode.el = placeholder
  return placeholder
}

/** 更新 Portal：复用子容器，patch 子节点 */
function patchPortal(_parent: Node, oldNode: Node | null, oldV: VNode, newV: VNode, ctx: WfuiContext): Node {
  const sub = oldV._portalEl
  newV._portalEl = sub
  if (!sub) return renderPortal(newV, ctx)

  const newChildren = normalize(newV.props?.children)
  const oldChildren = oldV._child || []
  newV._child = newChildren

  patchSimpleChildren(sub, oldChildren, newChildren, ctx)
  return oldNode ?? document.createTextNode('')
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
      callRefCleanup(oldInput)
      ;(oldNode as ChildNode).remove()
    }
    return null
  }

  const oldType = typeOf(oldInput)
  const newType = typeOf(newInput)

  // 类型不同 → 替换
  if (oldType !== newType) {
    callRefCleanup(oldInput)
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

  // 组件 — 组件级 $ Proxy
  if (typeof newV.type === 'function') {
    const comp = newV.type as Component

    // 保留跨 render 的状态存储
    if (oldV._$) newV._$ = oldV._$
    ;(ctx as any).ui = (ctx as any).ui ?? {}
    ;(ctx as any).ui.ready = !!newV._$
    // 每次重渲染都设置组件级 Proxy（深层包装）
    const _tgt = newV._$!
    const _dirtyFn2 = () => { if (_renderCount > 0) return; (ctx as any).ui?.dirty?.() }
    ;(ctx as any).ui.$ = createComponentProxy(_tgt, _dirtyFn2)

    _renderCount++
    let childNew
    try { childNew = comp(newV.props, ctx) } finally { _renderCount-- }
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
      // 传递 _cleanup 到新 VNode，确保卸载时能调用 ref 清理函数
      if (oldV._cleanup) newV._cleanup = oldV._cleanup
    } else if (oldNode) {
      // oldNode 不是元素节点 → 替换
      callRefCleanup(oldInput)
      const node = renderValue(newInput, ctx)
      oldNode.parentNode?.replaceChild(node, oldNode)
      return node
    }
    return oldNode
  }

  // Portal
  if (newV.type === Portal) {
    return patchPortal(parent, oldNode, oldV as VNode, newV as VNode, ctx)
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
  if (v.type === Portal) return 'portal'
  if (typeof v.type === 'string') return 'tag:' + v.type
  return 'unknown'
}

// ── patchProps ─────────────────────────────────────────

function patchProps(el: Element, oldProps: any, newProps: any) {
  const oldKeys = oldProps ? Object.keys(oldProps).filter(k => k !== 'children' && k !== 'key' && k !== 'ref') : []
  const newKeys = newProps ? Object.keys(newProps).filter(k => k !== 'children' && k !== 'key' && k !== 'ref') : []

  for (const key of oldKeys) {
    if (!newKeys.includes(key)) {
      if (key.startsWith('on') && typeof oldProps[key] === 'function') {
        el.removeEventListener(key.slice(2).toLowerCase(), oldProps[key] as EventListener)
      } else if (key === 'value' && (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) {
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
  // Phase 1: 删除多余的旧节点（逆序，防止 childNodes 索引偏移）
  for (let i = oldChildren.length - 1; i >= newChildren.length; i--) {
    const oldChild = oldChildren[i]
    const node = parent.childNodes[i]
    if (node) {
      callRefCleanup(oldChild)
      node.remove()
    }
  }

  // Phase 2: 更新/追加剩余节点
  const max = Math.max(oldChildren.length, newChildren.length)
  for (let i = 0; i < max; i++) {
    const oldChild = oldChildren[i]
    const newChild = newChildren[i]
    const existingNode = parent.childNodes[i] || null

    if (oldChild === undefined && newChild !== undefined) {
      const node = renderValue(newChild, ctx)
      parent.appendChild(node)
    } else if (oldChild !== undefined && newChild !== undefined) {
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
      callRefCleanup(entry.vnode)
      ;(entry.node as ChildNode)?.remove()
      oldKeyMap.delete(key)
    }
  }

  // 移除无 key 的旧子节点（从有 key 切换过来时）
  for (let i = oldChildren.length - 1; i >= 0; i--) {
    const key = getKey(oldChildren[i])
    if (key === undefined) {
      const node = parent.childNodes[i]
      if (node) { callRefCleanup(oldChildren[i]); (node as ChildNode).remove() }
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

// ── ref 回调 + 清理 ────────────────────────────────────

/** 调用 ref 回调的清理函数（保证在所有卸载路径中触发） */
function runRefCleanup(vnode: VNode) {
  if (vnode._cleanup) {
    vnode._cleanup()
    vnode._cleanup = undefined
  }
  // 递归子节点
  forEach(vnode.props?.children, child => {
    if (child && typeof child === 'object' && (child as VNode)._cleanup) {
      runRefCleanup(child as VNode)
    }
  })
}

/** 通知 ref 清理：调用 ref 回调返回的清理函数 + Portal 子容器清理 */
function callRefCleanup(input: any) {
  if (input == null || typeof input !== 'object') return
  const vnode = input as VNode
  // Portal 子容器移除
  if (vnode._portalEl) {
    vnode._portalEl.remove()
    vnode._portalEl = undefined
  }
  if (vnode._cleanup) runRefCleanup(vnode)
}

// ── 挂载到容器 ────────────────────────────────────────

export function mountVNode(container: Element, vnode: VNode, ctx: WfuiContext) {
  container.innerHTML = ''
  const node = renderValue(vnode, ctx)
  if (node instanceof Node) container.appendChild(node)
  else if (Array.isArray(node)) (node as any[]).forEach(n => container.appendChild(n))
}
