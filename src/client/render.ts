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
import { idRegistry, nextComponentId, callRefCleanup, startAsyncFactory, resolveAsyncFactorySync, resolveAsyncFactory } from './registry.ts'
// ⚠️ 与 diff.ts 的环：renderValue（本文件）↔ patchKeyedChildren（diff.ts）互相需要。
// 安全原因：两模块顶层仅常量声明，全部函数级延迟调用（渲染运行时两模块均已加载）。
import { patchProps, normalize, ensureKeys, patchKeyedChildren, mapChildDomNodes } from './diff.ts'

export const SVG_NS = 'http://www.w3.org/2000/svg'
export const SVG_TAGS = new Set(['svg', 'path', 'circle', 'line', 'rect', 'text', 'g', 'polyline', 'polygon', 'ellipse', 'defs', 'use', 'clipPath', 'mask', 'linearGradient', 'radialGradient', 'stop', 'tspan'])

// ── render ─────────────────────────────────────────────

export function render(input: any, ctx: WfuiContext): Node | null {
  return renderValue(input, ctx)
}

export function renderValue(v: any, ctx: WfuiContext): Node | null {
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
    // 记录 Fragment 实际产生的 DOM 节点（DocumentFragment 插入父节点后会展开成多个直属节点）
    // diff 用 `_childNodes` 做精确范围对齐——否则父级按位置索引 `parent.childNodes[i]` 会串位
    ;(vnode as any)._childNodes = Array.from(frag.childNodes)
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
 * （缓存本体在 registry.ts，本文件仅保留依赖 render 的调度函数）
 */

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
export function mountComponent(
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

  // mount 阶段标记：工厂执行期间 $ 初始化赋值丢弃（_rendering 保护语义细分）
  ;(ctx as any).ui?.setMounting?.(true)
  let childVNode: any
  try {
    childVNode = def(props, ctx)
  } finally {
    ;(ctx as any).ui?.endMounting?.()
  }
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
    vnode._id = nextComponentId()
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
  // 节点范围映射：Portal 子项含 Fragment 时产生多个 DOM 节点，需按实际范围对齐
  const oldNodes = mapChildDomNodes(Array.from(sub.childNodes), oldChildren)
  patchKeyedChildren(sub, oldChildren, newChildren, ctx, oldNodes, oldNodes[0]?.[0] ?? null)
}

function forEach(children: any, fn: (child: any) => void) {
  if (children == null) return
  if (Array.isArray(children)) { children.forEach(fn); return }
  fn(children)
}

/** 展平嵌套数组 */
export function flattenChildren(children: any): any[] {
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
  // ref 是特殊 prop：renderValue 中作为函数调用（ref(el)/ref(null)）——
  // 不落 DOM 属性（否则 setAttribute('ref', String(fn)) 污染 DOM）
  if (key === 'ref') return
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
  } else if (key === 'draggable') {
    // draggable 是 enumerated 属性（非 boolean）——setAttribute('draggable', '')
    // 空字符串解析为 false——必须显式 'true'/'false'
    el.setAttribute('draggable', value ? 'true' : 'false')
  } else if (key === 'value' && (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement)) {
    ;(el as HTMLSelectElement).value = String(value ?? '')
  } else if (value === true) {
    el.setAttribute(key, '')
  } else if (value != null && value !== false) {
    el.setAttribute(key, String(value))
  }
}

// ── 内联 ref 检测 ────────────────────────────────────
// ref-diff 在 ref 函数引用变化时调用旧 ref(null)（见 patchValue）。
// 内联 ref（render 里写 `ref: (el) => {...}`）每次渲染都是新函数 → 每渲染触发一次
// ref(null)+ref(el)，清理逻辑被反复执行而非仅在卸载时。同一元素变化 ≥3 次才警告
// （放过合法的单次/偶发替换，抓住每次渲染都变的内联反模式）。
// ── 清理 ────────────────────────────────────────────

// （ref 清理逻辑已移至 registry.ts：callRefCleanup / cleanupPortalChildren）

// ── 挂载到容器 ────────────────────────────────────────

export function mountVNode(container: Element, vnode: VNode, ctx: WfuiContext) {
  container.innerHTML = ''
  const node = renderValue(vnode, ctx)
  if (node instanceof Node) container.appendChild(node)
  else if (Array.isArray(node)) (node as any[]).forEach(n => container.appendChild(n))
}

// ── 兼容导出（P2 拆分：注册表状态已移至 registry.ts、diff 逻辑已移至 diff.ts，这里再导出保持旧导入路径可用） ──
export { callRefCleanup, idRegistry, clearAsyncComponentCache, nextComponentId } from './registry.ts'
export { patchValue } from './diff.ts'
