/**
 * vdom2 render — vnode → DOM（客户端渲染）
 *
 * 与 vdom1 同构的渲染语义，但组织方式为**类型分派表**（vdom2 方案）：
 * RENDERERS[classifyKind(v)] 查表调用——每类一个渲染函数，无 if-else 类型链。
 * 渲染是「创建目标」——按目标类型分派（与 patch 的「源类型驱动 x2y」互补）。
 *
 * 输出范围协议（与 kind.ts getOutputRange 一致）：
 * - Fragment：_childNodes（输出节点数组）
 * - 组件：_refNode = 输出范围首节点（非 DocumentFragment——展开后失效）
 * - 数组项：fragment-start/end 标记（DOM 持久化）
 */

import type { VNode, VNodeChild } from './vnode.ts'
import type { BrowserEnv } from '../types.ts'
import { Fragment, Portal, arrayChildren, isNative, isFrag, isComp, isPortal } from './vnode.ts'
import { classifyKind } from './kind.ts'
import { createClientBrowser } from '../browser.ts'
import { holeMarkup, setProp, createHole as _createHole } from './transform.ts'
import { trace, traceEnabled, kidsSeq, childNodesSeq } from './trace.ts'

const SVG_TAGS = new Set(['svg', 'path', 'circle', 'rect', 'line', 'polyline', 'polygon', 'g', 'text', 'defs', 'use', 'clipPath'])

/** 创建占位节点（数组上下文的无渲染值 → 注释节点，childNodes 与数组同构——规则表 §1） */
export function createHole(browser: BrowserEnv, v: unknown): Node | null {
  return _createHole(browser, v)
}

/** 递归渲染（同步——组件必须已构建；首帧/新增路径） */
export function renderValue(v: VNodeChild, ctx: any, browser?: BrowserEnv, key?: string | null, id?: string | null, fid?: string | null): Node | null {
  const b = (ctx?.browser ?? browser) as BrowserEnv
  if (!b) throw new Error('[vdom2] renderValue requires browser env (ctx.browser)')
  return RENDERERS[classifyKind(v)](v, ctx, b, key ?? undefined, id ?? undefined, fid ?? undefined)
}

// ── 各类型渲染 ──

function renderHole(v: VNodeChild, ctx: any, b: BrowserEnv): Node | null {
  return null // 顶层占位无 DOM；数组上下文由数组分支建 hole
}

function renderText(v: VNodeChild, ctx: any, b: BrowserEnv): Node | null {
  return b.createTextNode(String(v))
}

/** 数组项 = 隐式 Fragment：fragment-start/end 标记包裹（边界持久化——diff 直接读注释定位） */
function renderArray(v: VNodeChild, ctx: any, b: BrowserEnv, key?: string | null, id?: string | null, fid?: string | null): Node | null {
  const arr = v as VNodeChild[]
  const frag = b.createDocumentFragment()
  if (!frag) return null
  if (traceEnabled('render')) trace('render', 'debug', '', `array kids=${kidsSeq(arr)} fid=${fid ?? '-'} key=${key ?? '-'}`)
  // 数组项边界标记带身份：key 必写（父数组下标/显式 key）；fid = 位置路径（父 fid + 下标）——
  // start/end 共享 fid，嵌套数组项 fid 不同——end 配对精确（不干扰外层配对）
  const fragStart = b.createComment(holeMarkup({ type: 'fragment-start', key, id, fid: fid ?? undefined }))
  const fragEnd = b.createComment(holeMarkup({ type: 'fragment-end', key, id, fid: fid ?? undefined }))
  if (fragStart) frag.appendChild(fragStart)
  for (let i = 0; i < arr.length; i++) {
    const c = arr[i]
    const childFid = fid != null ? `${fid}-${i}` : String(i)
    const n = c == null || typeof c === 'boolean' ? createHole(b, c) : renderValue(c, ctx, b, String(i), undefined, childFid)
    if (n != null) frag.appendChild(n)
  }
  if (fragEnd) frag.appendChild(fragEnd)
  return frag
}

/** Portal：渲染到 #__wf_portal（body） */
function renderPortal(v: VNodeChild, ctx: any, b: BrowserEnv): Node | null {
  const vnode = v as VNode
  const pv = isPortal(vnode) ? vnode : (vnode as any)
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
    pv._remoteEl = container
  }
  return null
}

/** Fragment：多节点输出——_childNodes 记录完整范围（输出范围协议） */
function renderFrag(v: VNodeChild, ctx: any, b: BrowserEnv): Node | null {
  const vnode = v as VNode
  const fv = isFrag(vnode) ? vnode : (vnode as any)
  const frag = b.createDocumentFragment()
  if (!frag) return null
  const kidsArr = arrayChildren(vnode.props?.children)
  if (traceEnabled('render')) trace('render', 'debug', '', `fragment kids=${kidsSeq(kidsArr)}`)
  for (const c of kidsArr) {
    const n = c == null || typeof c === 'boolean' ? createHole(b, c) : renderValue(c, ctx, b)
    if (n != null) frag.appendChild(n)
  }
  fv._childNodes = Array.from(frag.childNodes) as Node[]
  if (traceEnabled('render')) trace('render', 'debug', '', `fragment out=${childNodesSeq(frag)}`)
  return frag
}

/** 组件：渲染输出（_child 必已构建）——_refNode = 输出范围首节点（非 DocumentFragment） */
function renderComp(v: VNodeChild, ctx: any, b: BrowserEnv): Node | null {
  const vnode = v as VNode
  const cv = isComp(vnode) ? vnode : (vnode as any)
  if (typeof cv._render !== 'function') {
    throw new Error(`[vdom2] component ${(vnode.type as any).name || 'anonymous'} not built (missing _render) — buildVNode must run before renderValue`)
  }
  if (cv._child === undefined) {
    throw new Error(`[vdom2] component ${(vnode.type as any).name || 'anonymous'} not built (missing _child) — buildVNode must run before renderValue`)
  }
  const childVNode = cv._child
  if (childVNode == null) {
    cv._child = null
    return null
  }
  cv._child = childVNode
  // 输出 vnode 引用（独立于 dispose 清空的 _child 链——getOutputRange 递归终点）
  cv._outputChild = childVNode
  if (typeof childVNode === 'object' && !Array.isArray(childVNode)) (childVNode as VNode)._parentVNode = vnode
  const node = renderValue(childVNode, ctx, b)
  if (node) {
    // _refNode 必须是输出范围首 DOM 节点（多节点输出 node 是 DocumentFragment——展开后失效）
    cv._refNode = node.nodeType === 11 ? (node.firstChild as Node | null) : node
    // 规则表 §4：组件实例 id → 输出每个顶层节点 data-wf-id（多根输出全部写）
    if (cv._id) {
      if (node.nodeType === 11) {
        for (const cn of Array.from(node.childNodes)) if (cn.nodeType === 1) (cn as Element).setAttribute('data-wf-id', cv._id)
      } else if (node.nodeType === 1) {
        ;(node as Element).setAttribute('data-wf-id', cv._id)
      }
    }
    // 规则表 §3：组件数组项 key → 输出每个顶层节点 data-wf-key
    if (cv.key != null) {
      if (node.nodeType === 11) {
        for (const cn of Array.from(node.childNodes)) if (cn.nodeType === 1) (cn as Element).setAttribute('data-wf-key', cv.key)
      } else if (node.nodeType === 1) {
        ;(node as Element).setAttribute('data-wf-key', cv.key)
      }
    }
  }
  return node
}

/** Native：元素渲染 + _childAnchors（每位置首节点锚点——引用驱动 diff 定位） */
function renderNative(v: VNodeChild, ctx: any, b: BrowserEnv, key?: string | null, fid?: string | null): Node | null {
  const vnode = v as VNode
  const nv = isNative(vnode) ? vnode : (vnode as any)
  const tag = vnode.type as string
  const el = SVG_TAGS.has(tag) ? b.createElementNS('http://www.w3.org/2000/svg', tag) : b.createElement(tag as any)
  if (!el) return null
  nv.el = el
  if (traceEnabled('render')) trace('render', 'trace', '', `native <${tag}> key=${vnode.key ?? '-'} kids=${kidsSeq(arrayChildren(vnode.props?.children))}`)
  if (vnode.key != null) el.setAttribute('data-wf-key', vnode.key)

  // select value 延后设置（options 生成前设置无效）
  let selectValue: any
  for (const [k, value] of Object.entries(vnode.props ?? {})) {
    if (k === 'children' || k === 'key') continue
    if (k === 'value' && el instanceof HTMLSelectElement) { selectValue = value; continue }
    setProp(el, k, value)
  }
  if (!('innerHTML' in (vnode.props ?? {}))) {
    // _childAnchors：children 每位置首 DOM 节点（替代 source[i] 下标猜测——多节点展开不错位）
    const anchors: (Node | null)[] = []
    const elChildren = arrayChildren(vnode.props?.children)
    for (let i = 0; i < elChildren.length; i++) {
      const c = elChildren[i]
      const childFid = fid != null ? `${fid}-${i}` : String(i)
      const n = c == null || typeof c === 'boolean' ? createHole(b, c) : renderValue(c, ctx, b, String(i), undefined, childFid)
      if (n == null) { anchors.push(null); continue }
      const anchorNode = n.nodeType === 11 ? (n.firstChild as Node | null) : n
      el.appendChild(n)
      anchors.push(anchorNode)
      if (c && typeof c === 'object' && !Array.isArray(c) && typeof (c as VNode).type === 'function') {
        const cv = c as VNode
        if (!cv._parentNode) {
          cv._parentNode = el
          cv._refNode = n
        }
      }
    }
    nv._childAnchors = anchors
    if (traceEnabled('render')) trace('render', 'trace', '', `native <${tag}> out=${childNodesSeq(el)}`)
  }
  if (selectValue !== undefined) {
    ;(el as HTMLSelectElement).value = String(selectValue)
  }
  return el
}

/** 渲染函数表（按 classifyKind 分派——每类一个实现，无 if-else 类型链） */
const RENDERERS: Record<string, (v: VNodeChild, ctx: any, b: BrowserEnv, key?: string | null, id?: string | null, fid?: string | null) => Node | null> = {
  // 渲染是「创建目标」——按目标类型分派（与 patch 的源类型驱动 x2y 互补）
  hole: renderHole,
  text: renderText,
  arr: renderArray,
  portal: renderPortal,
  frag: renderFrag,
  comp: renderComp,
  native: renderNative,
}

export function renderTree(v: VNodeChild, ctx: any, browser?: BrowserEnv): Node | null {
  return renderValue(v, ctx, browser ?? createClientBrowser())
}
