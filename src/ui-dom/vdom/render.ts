/**
 * vdom/render — DOM 落地（阶段 2 同步）
 *
 * **只处理已构建的组件**（`_render` 已设——buildVNode 已 await 工厂）。
 * 遇未构建组件 → 抛错（开发期暴露 bug；生产路径 renderByIds 先 build 后 patch，
 * 不会出现未构建组件）。
 */

import type { VNode, VNodeChild } from '../vnode.ts'
import type { BrowserEnv } from '../types.ts'
import { Fragment, Portal } from '../vnode.ts'

export const SVG_TAGS = new Set(['svg', 'path', 'circle', 'rect', 'line', 'polyline', 'polygon', 'g', 'text', 'defs', 'use', 'clipPath'])

const EVENT_RE = /^on[A-Z]/

export function setProp(el: Element, key: string, value: any): void {
  if (value == null || value === false) return
  const b = el.ownerDocument?.defaultView as any
  if (key === 'class' || key === 'className') {
    if (typeof value === 'object') {
      for (const [k, v] of Object.entries(value)) if (v) el.classList.add(k)
    } else {
      el.setAttribute('class', String(value))
    }
    return
  }
  if (key === 'style') {
    if (typeof value === 'string') el.setAttribute('style', value)
    else {
      const st = (el as HTMLElement).style
      for (const [k, v] of Object.entries(value)) {
        if (v == null) { (st as any)[k] = '' }  // null/undefined → 删除样式属性（§6.4 style 只设不删修复）
        else (st as any)[k] = String(v)
      }
    }
    return
  }
  if (key === 'ref') {
    if (typeof value === 'function') {
      // ref 错误隔离（safeCallRef——用户 ref 抛错不中断渲染管线）
      try { value(el) } catch (e) { console.error('[weifuwu] ref error', e) }
    }
    return
  }
  if (EVENT_RE.test(key)) {
    const type = key.slice(2).toLowerCase()
    el.addEventListener(type, value)
    return
  }
  if (key === 'value') {
    ;(el as HTMLInputElement).value = value
    return
  }
  if (key === 'innerHTML') {
    el.innerHTML = String(value ?? '')
    return
  }
  if (key === 'draggable' || key === 'contenteditable' || key === 'spellcheck') {
    // enumerated 属性：空字符串解析为 false（draggable 事故）——显式 true/false
    el.setAttribute(key, value ? 'true' : 'false')
    return
  }
  if (value === true) {
    el.setAttribute(key, '')
    return
  }
  try {
    ;(el as any)[key] = value
    if (el.getAttribute(key) !== String(value)) el.setAttribute(key, String(value))
  } catch {
    el.setAttribute(key, String(value))
  }
}

/** 递归渲染（同步——组件必须已构建） */
export function renderValue(v: VNodeChild, ctx: any, browser?: BrowserEnv): Node | null {
  const b = (ctx?.browser ?? browser) as BrowserEnv
  if (!b) throw new Error('[vdom] renderValue requires browser env (ctx.browser)')
  if (v == null || typeof v === 'boolean') return null
  if (typeof v === 'string' || typeof v === 'number') return b.createTextNode(String(v))
  if (Array.isArray(v)) {
    const frag = b.createDocumentFragment()
    if (!frag) return null
    for (const c of v) {
      const n = renderValue(c, ctx, b)
      if (n != null) frag.appendChild(n)
    }
    return frag
  }
  const vnode = v as VNode

  if (vnode.type === Portal) {
    // Portal：渲染到 #__wf_portal（body）
    const body = b.bodyElement()
    if (!body) return null
    let portalEl = body.querySelector('#__wf_portal') as HTMLElement | null
    if (!portalEl) {
      portalEl = b.createElement('div')
      if (portalEl) {
        portalEl.id = '__wf_portal'
        body.appendChild(portalEl)
      }
    }
    const container = b.createElement('div')
    if (container) {
      container.setAttribute('data-portal', String(vnode.props?.portalKey ?? 'wf'))
      const child = renderValue(vnode.props?.children ?? null, ctx, b)
      if (child != null) container.appendChild(child)
      if (portalEl) portalEl.appendChild(container)
      vnode._remoteEl = container
    }
    return null
  }

  if (vnode.type === Fragment) {
    const frag = b.createDocumentFragment()
    if (!frag) return null
    const children = (Array.isArray(vnode.props?.children) ? vnode.props.children : [vnode.props?.children]).flat(Infinity)
    for (const c of children) {
      const n = renderValue(c, ctx, b)
      if (n != null) frag.appendChild(n)
    }
    vnode._childNodes = Array.from(frag.childNodes) as Node[]
    return frag
  }

  if (typeof vnode.type === 'function') {
    // 组件必须已构建（buildVNode await 工厂）
    if (typeof vnode._render !== 'function') {
      throw new Error(`[vdom] component ${(vnode.type as any).name || 'anonymous'} not built (missing _render) — buildVNode must run before renderValue`)
    }
    // 优先用 buildVNode 预构建的 _child（重跑 renderFn 会产生未构建的新 vnode → 递归抛错）
    const childVNode = vnode._child !== undefined ? vnode._child : vnode._render(vnode.props)
    if (childVNode == null) {
      vnode._child = null
      return null
    }
    const child = Array.isArray(childVNode)
      ? childVNode
      : typeof childVNode === 'object' && typeof (childVNode as VNode).type === 'function'
        ? childVNode
        : childVNode
    vnode._child = child as VNode | VNode[] | null
    // 组件输出指向组件 vnode（供调度层向上找持有组件——当前不需要，保留引用便于调试）
    if (typeof child === 'object' && !Array.isArray(child)) (child as VNode)._parentVNode = vnode
    const node = renderValue(child, ctx, b)
    if (node) vnode._refNode = node
    return node
  }

  // Native
  const tag = vnode.type as string
  const el = SVG_TAGS.has(tag)
    ? b.createElementNS('http://www.w3.org/2000/svg', tag)
    : b.createElement(tag as any)
  if (!el) return null
  vnode.el = el

  for (const [key, value] of Object.entries(vnode.props ?? {})) {
    if (key === 'children' || key === 'key') continue
    setProp(el, key, value)
  }
  if (!('innerHTML' in (vnode.props ?? {}))) {
    const children = (Array.isArray(vnode.props?.children) ? vnode.props.children : [vnode.props?.children]).flat(Infinity)
    for (const c of children) {
      const n = renderValue(c, ctx, b)
      if (n == null) continue
      el.appendChild(n)
      // 子组件 DOM 锚点（精准刷新定位）
      if (c && typeof c === 'object' && !Array.isArray(c) && typeof (c as VNode).type === 'function') {
        const cv = c as VNode
        if (!cv._parentNode) {
          cv._parentNode = el
          cv._refNode = n
        }
      }
    }
  }
  return el
}
