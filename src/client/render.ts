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

import { Fragment, Portal, isPortal, isAsyncComponent } from './vnode.ts'
import type { VNode, Component, AsyncComponent } from './vnode.ts'
import type { WfuiContext } from './types.ts'

const SVG_NS = 'http://www.w3.org/2000/svg'
const SVG_TAGS = new Set(['svg', 'path', 'circle', 'line', 'rect', 'text', 'g', 'polyline', 'polygon', 'ellipse', 'defs', 'use', 'clipPath', 'mask', 'linearGradient', 'radialGradient', 'stop', 'tspan'])

// ── 组件实例 ID 注册表 ────────────────────────────

let _idCounter = 0
export const idRegistry = new Map<string, VNode>()

// ── render ─────────────────────────────────────────────

export function render(input: any, ctx: WfuiContext): Node | null {
  return renderValue(input, ctx)
}

function renderValue(v: any, ctx: WfuiContext): Node | null {
  if (v == null || typeof v === 'boolean') return null
  if (typeof v === 'string' || typeof v === 'number') return document.createTextNode(String(v))
  if (Array.isArray(v)) return renderArray(v, ctx)

  const vnode = v as VNode

  // Portal — 渲染到 document.body#__wf_portal
  if (vnode.type === Portal) {
    renderPortal(vnode, ctx)
    return null
  }

  // Fragment
  if (vnode.type === Fragment) {
    const frag = document.createDocumentFragment()
    const children = vnode.props?.children == null ? [] : (Array.isArray(vnode.props.children) ? vnode.props.children : [vnode.props.children])
    for (const child of children) {
      const node = renderValue(child, ctx)
      if (node != null) frag.appendChild(node)
    }
    return frag
  }

  // Component（同步组件或 async 工厂）
  if (typeof vnode.type === 'function') {
    return renderComponent(vnode.type as Component | AsyncComponent, vnode.props, vnode, ctx)
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
      if (childNode == null) continue
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

/**
 * 异步组件工厂缓存：同一工厂只执行一次，多实例/多渲染共享。
 * resolved 记录已解析的定义（同步快速路径用）。
 */
interface FactoryEntry {
  promise: Promise<Component<any, any>>
  resolved?: Component<any, any>
}
let asyncFactoryCache = new WeakMap<AsyncComponent<any, any>, FactoryEntry>()

/**
 * 清空 async 工厂缓存。
 * 页面上下文切换时调用（路由导航/登录登出）——工厂内 ctx.data.get 的 key 依赖 ctx（如 route.params），
 * 上下文变化后旧缓存定义的数据已失效，需要让工厂以新 ctx 重新执行。
 */
export function clearAsyncComponentCache(): void {
  asyncFactoryCache = new WeakMap()
}

/** 启动 async 工厂（幂等，缓存）：返回 entry，promise resolve 后 resolved 可用 */
function startAsyncFactory(Comp: AsyncComponent, ctx: WfuiContext): FactoryEntry {
  const existing = asyncFactoryCache.get(Comp)
  if (existing) return existing

  const entry: FactoryEntry = { promise: null as unknown as Promise<Component<any, any>> }
  entry.promise = Promise.resolve()
    .then(() => Comp(ctx))
    .then((def) => {
      if (typeof def !== 'function') {
        throw new Error(
          `asyncComponent factory <${Comp.name || 'anonymous'}> must return a Component ` +
            `(initProps, ctx) => (props) => VNode.`
        )
      }
      entry.resolved = def as Component
      return def as Component
    })
  asyncFactoryCache.set(Comp, entry)
  return entry
}

/** async 模式：await 工厂定义（初次渲染/服务端遍历/未来 hydration） */
async function resolveAsyncFactory(Comp: AsyncComponent, ctx: WfuiContext): Promise<Component> {
  return startAsyncFactory(Comp, ctx).promise
}

/** sync 模式：工厂已解析 → 定义；未解析 → undefined（占位 + 完成后整树重渲染） */
function resolveAsyncFactorySync(Comp: AsyncComponent): Component | undefined {
  return asyncFactoryCache.get(Comp)?.resolved
}

/** 占位完成后整树重渲染（async 工厂已解析，diff 收敛到目标位置） */
function scheduleFullReRender(ctx: WfuiContext) {
  const ui = (ctx as any).ui
  if (ui && typeof ui.render === 'function') ui.render(['_wf_root'])
}

/**
 * 同步 mount 组件（async 工厂占位策略）：
 *   - 同步组件 → def(props, ctx) → render fn → 输出 VNode
 *   - async 工厂已解析 → 同同步组件
 *   - async 工厂未解析 → 占位（返回 null）+ 启动工厂 + 完成后整树重渲染
 */
function mountComponent(
  Comp: Component | AsyncComponent,
  props: any,
  vnode: VNode,
  ctx: WfuiContext,
): VNode | null {
  let def: Component | undefined
  if (isAsyncComponent(Comp)) {
    def = resolveAsyncFactorySync(Comp)
    if (!def) {
      // 占位：启动工厂；resolve 后整树重渲染（此时已解析 → 同步渲染）
      void startAsyncFactory(Comp, ctx).promise.then(
        () => scheduleFullReRender(ctx),
        () => {
          // 工厂失败：保持占位（错误保留在缓存 Promise，不产生 unhandled rejection）
        },
      )
      return null
    }
  } else {
    def = Comp as Component
  }

  let childVNode: any = def(props, ctx)
  if (typeof childVNode !== 'function') {
    throw new Error(
      `Component ${Comp.name || 'anonymous'} must return a render function. ` +
      `Use (init_props, ctx) => (props) => VNode pattern.`
    )
  }
  vnode._render = childVNode
  return childVNode(props)
}

function renderComponent(
  Comp: Component | AsyncComponent,
  props: any,
  vnode: VNode,
  ctx: WfuiContext,
): Node | null {
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

  // 首次渲染记录当前 ctx 版本（供后续三态 skip 使用）
  vnode._ctxVersion = (childCtx.ui as any)._ctxVersion ?? 0

  let childVNode
  try {
    childVNode = mountComponent(Comp, props, vnode, childCtx)
  } catch (e) {
    const errHandler = (ctx as any).ui?._errorHandler
    if (errHandler) {
      errHandler(e)
      childVNode = null
    } else {
      console.error(
        `[weifuwu] Component render error in <${Comp.name || 'anonymous'}> (id: ${vnode._id ?? '?'}, phase: mount)`,
        e,
      )
      childVNode = null
    }
  }

  if (childVNode == null) {
    vnode._child = null
    return null
  }
  vnode._child = childVNode
  const domNode = renderValue(childVNode, childCtx)
  // 为组件 VNode 设置 DOM 锚点，供 scope render 使用
  // 如果组件被原生元素包裹，原生元素路径会覆盖 _parentNode
  // 如果组件被另一个组件返回（如 RouteView → Dashboard），这里确保锚点可用
  if (!(vnode as any)._refNode) {
    ;(vnode as any)._refNode = domNode
  }
  return domNode
}

function renderArray(arr: any[], ctx: WfuiContext): DocumentFragment {
  const frag = document.createDocumentFragment()
  for (const item of arr) {
    const node = renderValue(item, ctx)
    if (node != null) frag.appendChild(node)
  }
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

/** 首次渲染 Portal：创建远程容器、渲染子节点（不返回占位节点） */
export function renderPortal(vnode: VNode, ctx: WfuiContext): void {
  const container = ensurePortalContainer()
  const sub = document.createElement('div')
  sub.style.pointerEvents = 'auto'
  container.appendChild(sub)
  vnode._remoteEl = sub

  const children = normalize(vnode.props?.children)
  vnode._child = children
  for (const child of children) {
    const node = renderValue(child, ctx)
    if (node != null) sub.appendChild(node)
  }
}

/** 更新 Portal：复用远程容器，patch 子节点（不操作父 DOM） */
export function patchPortal(oldV: VNode | null, newV: VNode, ctx: WfuiContext): void {
  const sub = oldV?._remoteEl
  newV._remoteEl = sub
  if (!sub) { renderPortal(newV, ctx); return }

  const newChildren = normalize(newV.props?.children)
  const oldChildren = oldV._child || []
  newV._child = newChildren

  ensureKeys(oldChildren, newChildren)
  patchKeyedChildren(sub, oldChildren, newChildren, ctx)
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
      if (sv != null) (st as any)[sk] = typeof sv === 'number' ? sv + 'px' : String(sv)
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
    if (node == null) return null
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
    } else {
      // oldNode 为 null（remote 组件的 _refNode 为 null），但仍需清理 remote 容器
      callRefCleanup(oldInput)
    }
    return null
  }

  const oldType = typeOf(oldInput)
  const newType = typeOf(newInput)

  // 类型不同 → 替换
  if (oldType !== newType) {
    callRefCleanup(oldInput)
    const node = renderValue(newInput, ctx)
    if (node == null) return null
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
    const comp = newV.type as Component | AsyncComponent

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

    // ── 传递 ctx 版本号 ──
    newV._ctxVersion = oldV._ctxVersion ?? (childCtx.ui as any)._ctxVersion ?? 0

    // ── 三态 skip：props 没变 + $ 没脏 + ctx 版本一致 → 复用旧输出 ──
    if (
      oldV._render &&
      componentPropsEqual(oldV.props, newV.props) &&
      !(childCtx.ui as any)._dirtySet?.has(oldV._id) &&
      newV._ctxVersion === (childCtx.ui as any)._ctxVersion
    ) {
      // 复用旧 _child（DOM 未变，不需要重新 render）
      newV._child = oldV._child
      return oldNode
    }

    // 消费 dirty 标记（使后续 flushDirtyBatch 不会重复处理）
    ;(childCtx.ui as any)._dirtySet?.delete(oldV._id)

    let childNew
    try {
      if (typeof newV._render === 'function') {
        childNew = newV._render(newV.props)
      } else {
        // fallback: 首次挂载（_render 未传递）——支持 async 工厂（未解析 → 占位 + 完成后重渲染）
        childNew = mountComponent(comp, newV.props, newV, childCtx)
      }
    } catch (e) {
      const errHandler = (ctx as any).ui?._errorHandler
      if (errHandler) {
        errHandler(e)
        childNew = null
      } else {
        console.error(
          `[weifuwu] Component render error in <${comp?.name || 'anonymous'}> (id: ${oldV._id ?? '?'}, phase: update)`,
          e,
        )
        childNew = null
      }
    }
    // 先捕获 oldV._child 再设置 newV._child（防止 oldV === newV 时覆盖自身）
    const _prevChild = oldV._child
    newV._child = childNew

    const returnedNode = patchValue(parent, oldNode, _prevChild, childNew, childCtx)
    // patchValue 返回 null（组件输出为 null），_refNode 指向已移除的节点
    // 置 null 避免下次 render 使用已脱离 DOM 的引用
    if (!returnedNode) newV._refNode = null
    return returnedNode
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
      if (node == null) return null
      oldNode.parentNode?.replaceChild(node, oldNode)
      return node
    }
    return oldNode
  }

  // Portal
  if (newV.type === Portal) {
    patchPortal(oldV as VNode | null, newV as VNode, ctx)
    return null
  }

  // Array（map 结果等）
  if (Array.isArray(newInput)) {
    const oldArr = Array.isArray(oldInput) ? oldInput : []
    ensureKeys(oldArr, newInput)
    patchKeyedChildren(parent, oldArr, newInput, ctx)
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
        if (el instanceof SVGElement) el.setAttribute('class', classToString(newVal))
        else el.className = classToString(newVal)
      } else if (key === 'style' && typeof newVal === 'object') {
        const st = (el as HTMLElement).style
        for (const sk of Object.keys(newVal)) {
          const sv = newVal[sk]
          if (sv != null) (st as any)[sk] = typeof sv === 'number' ? sv + 'px' : String(sv)
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

function classToString(v: any): string {
  if (typeof v === 'string') return v
  if (Array.isArray(v)) return v.filter(Boolean).join(' ')
  if (v && typeof v === 'object') {
    return Object.entries(v).filter(([, b]) => b).map(([k]) => k).join(' ')
  }
  return ''
}

// ── patchChildren ──────────────────────────────────────

function getKey(input: any): string | undefined {
  if (input == null || typeof input !== 'object') return undefined
  return (input as VNode).key
}

/** 为无 key 的子节点自动分配位置 key，确保 keyed diff 正确性 */
function ensureKeys(oldChildren: any[], newChildren: any[]) {
  const hasKey = newChildren.some(c => c && typeof c === 'object' && c.key !== undefined)
  if (!hasKey) {
    for (let i = 0; i < newChildren.length; i++) {
      const c = newChildren[i]
      if (c && typeof c === 'object') c.key = i
    }
    for (let i = 0; i < oldChildren.length; i++) {
      const c = oldChildren[i]
      if (c && typeof c === 'object') c.key = i
    }
  }
}

function patchChildren(parent: Node, oldVNode: VNode, newVNode: VNode, ctx: WfuiContext) {
  const oldChildren = normalize(oldVNode.props?.children)
  const newChildren = normalize(newVNode.props?.children)

  // 始终使用 keyed diff，无 key 时自动分配位置 key
  ensureKeys(oldChildren, newChildren)
  patchKeyedChildren(parent, oldChildren, newChildren, ctx)
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

function patchKeyedChildren(parent: Node, oldChildren: any[], newChildren: any[], ctx: WfuiContext) {
  const allUnkeyed = !newChildren.some(c => c && typeof c === 'object' && c.key !== undefined)

  if (allUnkeyed) {
    // 全无 key：按位置匹配，不移动 DOM
    const len = Math.max(oldChildren.length, newChildren.length)
    for (let i = 0; i < len; i++) {
      const oldC = i < oldChildren.length ? oldChildren[i] : null
      const newC = i < newChildren.length ? newChildren[i] : null
      if (newC == null) {
        if (oldC != null) {
          callRefCleanup(oldC)
          const node = parent.childNodes[i]
          if (node) (node as ChildNode).remove()
        }
      } else if (oldC == null) {
        const node = renderValue(newC, ctx)
        if (node != null) parent.appendChild(node)
      } else {
        const oldNode = parent.childNodes[i] || null
        patchValue(parent, oldNode, oldC, newC, ctx)
      }
    }
    return
  }

  // 以下为 keyed 子节点路径
  // Step 1: 移除无 key 的旧子节点
  let rmIdx = 0
  for (let i = 0; i < oldChildren.length; i++) {
    const child = oldChildren[i]
    if (child == null || typeof child === 'boolean') continue
    const key = getKey(child)
    if (key === undefined) {
      const node = parent.childNodes[rmIdx]
      if (node) (node as ChildNode).remove()
    } else {
      const isRemote = child && typeof child === 'object' && (child as VNode)._placement === 'remote'
      if (!isRemote) rmIdx++
    }
  }

  // Step 2: Build old key map
  const oldKeyMap = new Map<string, { vnode: any; node: Node | null; remote: boolean; index: number }>()
  let domIdx = 0
  for (let i = 0; i < oldChildren.length; i++) {
    const key = getKey(oldChildren[i])
    if (key !== undefined) {
      const child = oldChildren[i]
      const isRemote = child && typeof child === 'object' && (child as VNode)._placement === 'remote'
      oldKeyMap.set(key, {
        vnode: child,
        node: isRemote ? null : (parent.childNodes[domIdx] || null),
        remote: !!isRemote,
        index: domIdx,
      })
      if (!isRemote) domIdx++
    }
  }

  // Step 3: Remove vanished keys
  const newKeys = newChildren.map(c => getKey(c))
  for (const key of oldKeyMap.keys()) {
    if (!newKeys.includes(key)) {
      const entry = oldKeyMap.get(key)!
      callRefCleanup(entry.vnode)
      if (entry.node) (entry.node as ChildNode)?.remove()
      oldKeyMap.delete(key)
    }
  }

  // Step 4: Forward patch + move（React-style lastIndex 算法）
  let lastIndex = -1
  let nextRef: Node | null = parent.firstChild
  for (let i = 0; i < newChildren.length; i++) {
    const key = newKeys[i]
    const newChild = newChildren[i]
    const oldEntry = key !== undefined ? oldKeyMap.get(key) : undefined
    const isRemote = newChild && typeof newChild === 'object' && (newChild as VNode)._placement === 'remote'

    if (oldEntry) {
      if (oldEntry.node) {
        if (oldEntry.index < lastIndex) {
          parent.insertBefore(oldEntry.node, nextRef)
        }
        lastIndex = Math.max(lastIndex, oldEntry.index)
        patchValue(parent, oldEntry.node, oldEntry.vnode, newChild, ctx)
        nextRef = (oldEntry.node.parentNode === parent ? oldEntry.node : parent.firstChild)?.nextSibling ?? null
      } else if (oldEntry.remote) {
        patchPortal(oldEntry.vnode, newChild, ctx)
      } else {
        const newNode = patchValue(parent, null, oldEntry.vnode, newChild, ctx)
        if (newNode != null) {
          parent.insertBefore(newNode, nextRef)
          nextRef = newNode.nextSibling
        }
      }
    } else if (isRemote) {
      renderPortal(newChild, ctx)
    } else {
      const node = renderValue(newChild, ctx)
      if (node != null) {
        parent.insertBefore(node, nextRef)
        nextRef = node.nextSibling
      }
    }
  }
}

/**
 * 子节点逐元素浅比较（用于 componentPropsEqual 的 children 维度）
 *
 * 对 string/number 做值比较，VNode 做引用比较。
 * 只做一层，不递归（JSX 编译的 flat children 是一维数组）。
 */
function childrenEqual(a: any, b: any): boolean {
  if (a === b) return true
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false
    }
    return true
  }
  return a === b
}

/**
 * 组件级 props 浅比较——包含 children 的元素级比较
 *
 * 与 props 不同，组件的 children 是 render 函数的输入之一。
 * children 为 ['点击 ', count, ' 次'] 时，count 值变必须触发 render。
 * 但数组引用不同而内容相同的情况（每次 JSX 新数组），用 childrenEqual 避免误判。
 */
function componentPropsEqual(a: any, b: any): boolean {
  if (a === b) return true
  if (!a || !b) return false
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  for (const key of keys) {
    if (key === 'key') continue
    if (key === 'children') {
      if (!childrenEqual(a[key], b[key])) return false
    } else if (a[key] !== b[key]) {
      return false
    }
  }
  return true
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
export function callRefCleanup(input: any) {
  if (input == null || typeof input !== 'object') return
  const vnode = input as VNode

  // ── 组件卸载：从 idRegistry 注销并清除渲染状态 ──
  // 防止卸载后残留的异步回调（setTimeout/Promise/WS 消息等）通过
  // ctx.ui.dirty()/render() 触发死组件重渲染，把 DOM 重新插回当前页面
  if (vnode._id) {
    if (vnode._customId) idRegistry.delete(vnode._customId)
    idRegistry.delete(vnode._id)
    vnode._id = undefined
    vnode._customId = undefined
    vnode._render = undefined
    vnode._parentNode = undefined
    vnode._refNode = undefined
  }

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
  if (vnode._remoteEl) {
    cleanupPortalChildren(vnode)
    vnode._remoteEl.remove()
    vnode._remoteEl = undefined
  }
}

// ── 挂载到容器 ────────────────────────────────────────

export function mountVNode(container: Element, vnode: VNode, ctx: WfuiContext) {
  container.innerHTML = ''
  const node = renderValue(vnode, ctx)
  if (node instanceof Node) container.appendChild(node)
  else if (Array.isArray(node)) (node as any[]).forEach(n => container.appendChild(n))
}

// ── Hydration（游标收养）──────────────────────────────

/**
 * 游标：当前遍历位置对应的 DOM 节点。
 * 不变量：元素/文本 VNode 恰好消耗一个游标节点；组件/Fragment/数组透明；null 消耗零；
 * 创建时 insertBefore(游标) 且游标不动；收养/替换时游标前进。
 */
interface HydrationCursor {
  parent: Node
  node: Node | null
}

function cursorAdvance(c: HydrationCursor) {
  c.node = c.node ? c.node.nextSibling : null
}

/** 创建节点：插到游标前（或父末尾），游标不动 */
function cursorInsert(c: HydrationCursor, n: Node) {
  if (c.node && c.node.parentNode) c.node.parentNode.insertBefore(n, c.node)
  else c.parent.appendChild(n)
}

/** 替换游标节点（tag 不匹配）：消耗游标（前进到原节点下一个兄弟） */
function cursorReplace(c: HydrationCursor, n: Node) {
  if (c.node && c.node.parentNode) {
    c.node.parentNode.replaceChild(n, c.node)
    cursorAdvance(c)
  } else {
    c.parent.appendChild(n)
  }
}

/**
 * Hydration 渲染：收养现有 DOM（不重建），只接线事件/属性/ref。
 * async：await 工厂（hydration 时 __DATA__ 同步命中，微任务即 resolve）。
 */
async function renderValueHydrating(v: any, ctx: WfuiContext, c: HydrationCursor): Promise<Node | null> {
  if (v == null || typeof v === 'boolean') return null
  if (typeof v === 'string' || typeof v === 'number') {
    const text = String(v)
    if (c.node && c.node.nodeType === 3) {
      if (c.node.textContent !== text) c.node.textContent = text
      cursorAdvance(c)
      return c.node
    }
    const tn = document.createTextNode(text)
    cursorInsert(c, tn)
    return tn
  }
  if (Array.isArray(v)) {
    let first: Node | null = null
    for (const item of v) {
      const n = await renderValueHydrating(item, ctx, c)
      if (n != null && !first) first = n
    }
    return first
  }
  const vnode = v as VNode

  // Portal/Fragment：就地内联收养（v1 裁剪：portal 内容不移动到 __wf_portal）
  if (vnode.type === Portal || vnode.type === Fragment) {
    const children = vnode.props?.children
    const arr = children == null ? [] : (Array.isArray(children) ? children : [children])
    let first: Node | null = null
    for (const child of arr) {
      const n = await renderValueHydrating(child, ctx, c)
      if (n != null && !first) first = n
    }
    return first
  }

  // 组件（同步或 async 工厂）
  if (typeof vnode.type === 'function') {
    return renderComponentHydrating(vnode, ctx, c)
  }

  // 原生元素：收养（tag 匹配）或替换（mismatch 恢复）
  const tag = vnode.type as string
  const props = vnode.props ?? {}
  let el: Element
  if (c.node && c.node.nodeType === 1 && (c.node as Element).tagName.toLowerCase() === tag.toLowerCase()) {
    el = c.node as Element
    cursorAdvance(c)
  } else {
    el = SVG_TAGS.has(tag) ? document.createElementNS(SVG_NS, tag) : document.createElement(tag)
    cursorReplace(c, el)
  }
  vnode.el = el

  // 属性 + 事件接线（oldProps 为 null → 全量设置）
  patchProps(el, null, props)

  if ('innerHTML' in props) {
    // 服务端已输出 innerHTML 内容——收养不动
  } else {
    const childCursor: HydrationCursor = { parent: el, node: el.firstChild }
    const children = flattenChildren(props.children)
    for (const child of children) {
      const n = await renderValueHydrating(child, ctx, childCursor)
      if (n != null && n.parentNode !== el) el.appendChild(n)
      // 为子组件 VNode 设置 DOM 锚点（供 ctx.ui.render() scope 使用）
      if (child && typeof child === 'object' && typeof (child as VNode).type === 'function') {
        const childVNode = child as VNode
        if (!childVNode._parentNode) {
          childVNode._parentNode = el
          childVNode._refNode = n
        }
      }
    }
    // 收尾：删除服务端有、客户端没有的多余子节点
    while (childCursor.node) {
      const n = childCursor.node
      childCursor.node = n.nextSibling
      n.parentNode?.removeChild(n)
    }
  }

  // select value（options 生成后设置）
  if ('value' in props && el instanceof HTMLSelectElement) {
    ;(el as HTMLSelectElement).value = String(props.value ?? '')
  }
  // ref 回调：收养的 DOM 立即接线
  if (typeof props.ref === 'function') props.ref(el)

  return el
}

/** Hydration 组件：await 工厂（或同步 mount）→ render → 递归收养；填充实例簿记 */
async function renderComponentHydrating(vnode: VNode, ctx: WfuiContext, c: HydrationCursor): Promise<Node | null> {
  ;(ctx as any).ui = (ctx as any).ui ?? {}

  if (!vnode._id) {
    vnode._id = `_wf_${_idCounter++}`
    idRegistry.set(vnode._id, vnode)
  }
  const childCtx = Object.create(ctx) as WfuiContext
  childCtx.ui = Object.create(ctx.ui as any) as any
  childCtx.ui._selfId = vnode._id
  childCtx.ui._selfVNode = vnode
  vnode._ctxVersion = (childCtx.ui as any)._ctxVersion ?? 0

  const Comp = vnode.type as Component | AsyncComponent
  let childVNode: any
  try {
    let def: Component
    if (isAsyncComponent(Comp)) {
      def = await resolveAsyncFactory(Comp, childCtx)
    } else {
      def = Comp as Component
    }
    const renderFn = def(vnode.props ?? {}, childCtx)
    if (typeof renderFn !== 'function') {
      throw new Error(
        `Component ${Comp.name || 'anonymous'} must return a render function. ` +
        `Use (init_props, ctx) => (props) => VNode pattern.`
      )
    }
    vnode._render = renderFn
    childVNode = renderFn(vnode.props ?? {})
  } catch (e) {
    const errHandler = (ctx as any).ui?._errorHandler
    if (errHandler) {
      errHandler(e)
      childVNode = null
    } else {
      console.error(
        `[weifuwu] Component hydration error in <${Comp.name || 'anonymous'}> (id: ${vnode._id ?? '?'})`,
        e,
      )
      childVNode = null
    }
  }

  if (childVNode == null) {
    vnode._child = null
    return null
  }
  vnode._child = childVNode
  const domNode = await renderValueHydrating(childVNode, childCtx, c)
  if (!(vnode as any)._refNode) {
    ;(vnode as any)._refNode = domNode
  }
  return domNode
}

/**
 * Hydration 挂载入口：收养 container 内现有服务端 HTML。
 * 渲染完收尾：删除服务端有、客户端没有的残留 DOM。
 */
export async function hydrateVNode(container: Element, vnode: VNode, ctx: WfuiContext): Promise<void> {
  const cursor: HydrationCursor = { parent: container, node: container.firstChild }
  await renderValueHydrating(vnode, ctx, cursor)
  // 收尾：清理残留
  while (cursor.node) {
    const n = cursor.node
    cursor.node = n.nextSibling
    n.parentNode?.removeChild(n)
  }
}
