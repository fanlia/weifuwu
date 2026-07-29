/**
 * weifuwu/client 渲染器 — VNode → DOM + patchValue diff
 *
 * render(vnode, ctx)      → 首次渲染，返回 DOM
 * patchValue(el, old, new, ctx) → 增量更新
 *
 * 支持：
 *   - key 属性（keyed diff）
 *   - ref / keyed diff
 *
 * 状态管理：组件使用闭包变量 + ctx.ui.render() 手动触发重渲染。
 */

import { Fragment, Portal, isPortal } from './vnode.ts'
import type { VNode, Component } from './vnode.ts'
import type { WfuiContext } from './types.ts'

const SVG_NS = 'http://www.w3.org/2000/svg'
const SVG_TAGS = new Set(['svg', 'path', 'circle', 'line', 'rect', 'text', 'g', 'polyline', 'polygon', 'ellipse', 'defs', 'use', 'clipPath', 'mask', 'linearGradient', 'radialGradient', 'stop', 'tspan'])

// ── 组件实例 ID 注册表 ────────────────────────────

let _idCounter = 0
export const idRegistry = new Map<string, VNode>()

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

  // Native element（SVG 元素必须用 createElementNS）
  const tag = vnode.type as string
  const el = SVG_TAGS.has(tag) ? document.createElementNS(SVG_NS, tag) : document.createElement(tag)
  vnode.el = el

  // 先设非 value 属性
  let selectValue: any
  for (const [key, value] of Object.entries(vnode.props ?? {})) {
    if (key === 'children' || key === 'key' || key === 'value' || key === 'innerHTML') continue
    setProp(el, key, value)
  }
  if ('value' in (vnode.props ?? {}) && el instanceof HTMLSelectElement) {
    selectValue = vnode.props!.value
  } else if ('value' in (vnode.props ?? {})) {
    setProp(el, 'value', vnode.props!.value)
  }

  // innerHTML 优先：跳过 children 渲染
  if ('innerHTML' in (vnode.props ?? {})) {
    el.innerHTML = String(vnode.props!.innerHTML ?? '')
  } else {
    // children（select 的 options 必须先生成再设 value）
    const flatChildren = flattenChildren(vnode.props?.children)
    for (const child of flatChildren) {
      const childNode = renderValue(child, ctx)
      el.appendChild(childNode)
      // 首次渲染后为子组件 VNode 设置 DOM 锚点（供 scope render 使用）
      if (child && typeof child === 'object' && typeof (child as VNode).type === 'function') {
        const childVNode = child as VNode
        if (!childVNode._parentNode) {
          childVNode._parentNode = el
          childVNode._refNode = childNode
        }
      }
    }
  }

  // select value 在 options 生成后设置
  if (selectValue !== undefined) {
    ;(el as HTMLSelectElement).value = String(selectValue)
  }

  // ref 回调：ref(el) 初始化，元素移除时 ref(null) 清理
  if (typeof vnode.props?.ref === 'function') vnode.props.ref(el)

  return el
}

function renderComponent(Comp: Component, props: any, vnode: VNode, ctx: WfuiContext): Node {
  ;(ctx as any).ui = (ctx as any).ui ?? {}

  // 生成组件实例 ID
  if (!vnode._id) {
    vnode._id = `_wf_${_idCounter++}`
    idRegistry.set(vnode._id, vnode)
  }

  // 扩展 ctx：每个组件有自己的 _selfId 和 VNode 引用
  const childCtx = Object.create(ctx) as WfuiContext
  childCtx.ui = Object.create(ctx.ui as any) as any
  childCtx.ui._selfId = vnode._id
  childCtx.ui._selfVNode = vnode

  let childVNode
  try {
    childVNode = Comp(props, childCtx)

    if (typeof childVNode !== 'function') {
      throw new Error(
        `Component ${Comp.name || 'anonymous'} must return a render function. ` +
        `Use (init_props, ctx) => (props) => VNode pattern.`
      )
    }
    vnode._render = childVNode
    childVNode = childVNode(props)
  } catch (e) {
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
    // SVG use setAttribute('class'), HTML use className property
    if (el instanceof SVGElement) el.setAttribute('class', String(value ?? ''))
    else el.className = String(value ?? '')
  } else if (key === 'style' && typeof value === 'object' && value !== null) {
    const st = (el as HTMLElement).style
    for (const sk of Object.keys(value)) {
      const sv = value[sk]
      if (sv != null) st[sk] = typeof sv === 'number' ? sv + 'px' : String(sv)
    }
  } else if (key.startsWith('on') && typeof value === 'function') {
    el.addEventListener(key.slice(2).toLowerCase(), value as EventListener)
  } else if (key === 'value' && (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement)) {
    ;(el as HTMLSelectElement).value = String(value ?? '')
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

  // 组件
  if (typeof newV.type === 'function') {
    const comp = newV.type as Component

    // 传递 _render（两阶段组件复用 render 函数）+ 保持实例 ID
    if (oldV._render) {
      newV._render = oldV._render
      newV._id = oldV._id
      if (newV._id) idRegistry.set(newV._id, newV)
    }

    // 存 DOM 锚点（供 ctx.ui.render() scope 使用）
    newV._parentNode = parent
    newV._refNode = oldNode

    // 扩展 ctx：注入 _selfId 和 VNode 引用
    const childCtx = Object.create(ctx) as WfuiContext
    childCtx.ui = Object.create(ctx.ui as any) as any
    childCtx.ui._selfId = newV._id
    childCtx.ui._selfVNode = newV

    let childNew
    try {
      if (typeof newV._render === 'function') {
        childNew = newV._render(newV.props)
      } else {
        // fallback: call component directly (_render not transferred)
        childNew = comp(newV.props, childCtx)
        if (typeof childNew === 'function') {
          newV._render = childNew
          childNew = childNew(newV.props)
        }
      }
    } catch (e) {
      const errHandler = (ctx as any).ui?._errorHandler
      if (errHandler) {
        errHandler(e)
        childNew = null
      } else {
        console.error('Component render error:', e)
        childNew = null
      }
    }
    // 先捕获 oldV._child 再设置 newV._child（防止 oldV === newV 时覆盖自身）
    const _prevChild = oldV._child
    newV._child = childNew

    return patchValue(parent, oldNode, _prevChild, childNew, ctx)
  }

  // Fragment
  if (newV.type === Fragment) {
    patchChildren(parent, oldV, newV, ctx)
    return oldNode
  }

  // Native element
  if (typeof newV.type === 'string') {
    if (oldNode && oldNode.nodeType === 1) {
      // ref 变化处理：旧 ref(null) 清理，新 ref(el) 初始化
      const oldRef = oldV.props?.ref
      const newRef = newV.props?.ref
      if (oldRef !== newRef) {
        if (typeof oldRef === 'function') oldRef(null)
        if (typeof newRef === 'function') newRef(oldNode)
      }
      patchProps(oldNode as Element, oldV.props, newV.props)
      patchChildren(oldNode, oldV, newV, ctx)
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
  const oldKeys = oldProps ? Object.keys(oldProps).filter(k => k !== 'children' && k !== 'key' && k !== 'innerHTML') : []
  const newKeys = newProps ? Object.keys(newProps).filter(k => k !== 'children' && k !== 'key' && k !== 'innerHTML') : []

  for (const key of oldKeys) {
    if (!newKeys.includes(key)) {
      if (key === 'ref') continue
      if (key.startsWith('on') && typeof oldProps[key] === 'function') {
        el.removeEventListener(key.slice(2).toLowerCase(), oldProps[key] as EventListener)
      } else if (key === 'value' && (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement)) {
        ;(el as HTMLSelectElement).value = ''
      } else {
        el.removeAttribute(key === 'className' ? 'class' : key)
      }
    }
  }

  for (const key of newKeys) {
    if (key === 'ref') continue
    const oldVal = oldProps?.[key]
    const newVal = newProps?.[key]
    if (key === 'innerHTML') {
      if (newVal !== oldVal) (el as HTMLElement).innerHTML = String(newVal ?? '')
    } else if (newVal !== oldVal) {
      if (key === 'class' || key === 'className') {
        if (el instanceof SVGElement) el.setAttribute('class', String(newVal ?? ''))
        else el.className = String(newVal ?? '')
      } else if (key === 'style' && typeof newVal === 'object') {
        const st = (el as HTMLElement).style
        for (const sk of Object.keys(newVal)) {
          const sv = newVal[sk]
          if (sv != null) st[sk] = typeof sv === 'number' ? sv + 'px' : String(sv)
        }
      } else if (key.startsWith('on') && typeof newVal === 'function') {
        const eventName = key.slice(2).toLowerCase()
        // 移除旧监听器，防止累积
        if (typeof oldVal === 'function') el.removeEventListener(eventName, oldVal as EventListener)
        el.addEventListener(eventName, newVal as EventListener)
      } else if (key === 'value' && (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement)) {
        ;(el as HTMLSelectElement).value = String(newVal ?? '')
      } else if (newVal === true) {
        el.setAttribute(key, '')
      } else if (newVal != null && newVal !== false) {
        el.setAttribute(key, String(newVal))
      } else {
        if (key === 'value' && (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement)) {
          ;(el as HTMLSelectElement).value = ''
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
  // 预先捕获旧 DOM 节点，防止 insertBefore 导致 childNodes 索引漂移
  const oldNodes: (Node | null)[] = []
  for (let i = 0; i < max; i++) {
    oldNodes.push(parent.childNodes[i] || null)
  }
  for (let i = 0; i < max; i++) {
    const oldChild = oldChildren[i]
    const newChild = newChildren[i]
    const existingNode = oldNodes[i]

    if (oldChild === undefined && newChild !== undefined) {
      const node = renderValue(newChild, ctx)
      // 插入到正确位置（oldNodes[i] 是此位置的 DOM 节点）
      parent.insertBefore(node, oldNodes[i + 1] ?? null)
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

/** 浅比较两个 props 对象，跳过 children/key */
function propsEqual(a: any, b: any): boolean {
  if (a === b) return true
  if (!a || !b) return false
  const aKeys = Object.keys(a).filter(k => k !== 'children' && k !== 'key')
  const bKeys = Object.keys(b).filter(k => k !== 'children' && k !== 'key')
  if (aKeys.length !== bKeys.length) return false
  for (const key of aKeys) {
    if (a[key] !== b[key]) return false
  }
  return true
}

// ── 清理 ────────────────────────────────────────────

/** 递归清理 Portal 子内容的 ref */
function cleanupPortalChildren(vnode: VNode) {
  const child = vnode._child
  if (child == null) return
  if (Array.isArray(child)) {
    for (const c of child) {
      if (c && typeof c === 'object') callRefCleanup(c as VNode)
    }
  } else if (typeof child === 'object') {
    callRefCleanup(child as VNode)
  }
}

/** 通知 ref 清理 + Portal 子容器清理 */
function callRefCleanup(input: any) {
  if (input == null || typeof input !== 'object') return
  const vnode = input as VNode
  // 先递归清理 _child（支持数组——Portal 的 _child 是 `[root, ...]`）
  if (vnode._child != null) {
    if (Array.isArray(vnode._child)) {
      for (const child of vnode._child) {
        if (child && typeof child === 'object') callRefCleanup(child as VNode)
      }
    } else {
      callRefCleanup(vnode._child as VNode)
    }
    vnode._child = undefined
  }
  // 递归 props.children（寻找子组件 VNode）
  if (vnode.props?.children && typeof vnode.type === 'string') {
    const children = Array.isArray(vnode.props.children) ? vnode.props.children : [vnode.props.children]
    for (const child of children) {
      if (child && typeof child === 'object') callRefCleanup(child as VNode)
    }
  }
  // 执行 ref 清理
  if (typeof vnode.props?.ref === 'function') vnode.props.ref(null)

  // Portal 子容器移除 + 子内容 ref 清理
  if (vnode._portalEl) {
    cleanupPortalChildren(vnode)
    vnode._portalEl.remove()
    vnode._portalEl = undefined
  }
}

// ── 挂载到容器 ────────────────────────────────────────

export function mountVNode(container: Element, vnode: VNode, ctx: WfuiContext) {
  container.innerHTML = ''
  const node = renderValue(vnode, ctx)
  if (node instanceof Node) container.appendChild(node)
  else if (Array.isArray(node)) (node as any[]).forEach(n => container.appendChild(n))
}
