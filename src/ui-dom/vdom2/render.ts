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

import type { VNode, VNodeChild } from '../vnode.ts'
import type { BrowserEnv } from '../types.ts'
import { Fragment, Portal, arrayChildren, isNative, isFrag, isComp, isPortal, type NativeVNode, type FragVNode, type CompVNode, type PortalVNode } from '../vnode.ts'
import { classifyKind } from './kind.ts'
import { componentName } from './ctx.ts'
import type { Lifecycle } from './lifecycle.ts'
import { createClientBrowser } from '../browser.ts'
import { holeMarkup, setProp, createHole as _createHole } from './transform.ts'
import { trace, traceEnabled, kidsSeq, childNodesSeq } from './trace.ts'

const SVG_TAGS = new Set(['svg', 'path', 'circle', 'rect', 'line', 'polyline', 'polygon', 'g', 'text', 'defs', 'use', 'clipPath'])

/** 创建占位节点（数组上下文的无渲染值 → 注释节点，childNodes 与数组同构——规则表 §1） */
export function createHole(browser: BrowserEnv, v: unknown): Node | null {
  return _createHole(browser, v)
}

/** 递归渲染（同步——组件必须已构建；首帧/新增路径） */
export function renderValue(v: VNodeChild, ctx: any, browser?: BrowserEnv, key: string | null = null, id: string | null = null, fid: string | null = null): Node | null {
  const b = (ctx?.browser ?? browser) as BrowserEnv
  if (!b) throw new Error('[vdom2] renderValue requires browser env (ctx.browser)')
  return RENDERERS[classifyKind(v)](v, ctx, b, key, id, fid)
}

// ── 各类型渲染 ──

function renderHole(v: VNodeChild, ctx: any, b: BrowserEnv): Node | null {
  return null // 顶层占位无 DOM；数组上下文由数组分支建 hole
}

function renderText(v: VNodeChild, ctx: any, b: BrowserEnv): Node | null {
  return b.createTextNode(String(v))
}

/** 数组项 = 隐式 Fragment：fragment-start/end 标记包裹（边界持久化——diff 直接读注释定位） */
/** 数组子项渲染（占位法统一，§6.3）：
 *  - 数组项本身无渲染值（false/null/boolean）→ 建占位
 *  - 数组项是组件且组件输出 null（值层有值、渲染层无输出）→ 同样建占位
 *    （占位法缺口修复：childNodes 恒与数组同构——diff oldNodes 映射不漂移；
 *    否则组件输出 null 的槽位空缺 → src[k] 错位指向兄弟 → stale 引用 → insertBefore 抛错） */
function renderChild(c: VNodeChild, ctx: any, b: BrowserEnv, i: number, fid: string | null): Node | null {
  if (c == null || typeof c === 'boolean') return createHole(b, c)
  const n = renderValue(c, ctx, b, String(i), null, fid)
  if (n == null) return createHole(b, null) // 组件输出 null → 占位（与 false/null 同构）
  return n
}

function renderArray(v: VNodeChild, ctx: any, b: BrowserEnv, key: string | null = null, id: string | null = null, fid: string | null = null): Node | null {
  const arr = v as VNodeChild[]
  const frag = b.createDocumentFragment()
  if (!frag) return null
  if (traceEnabled('render')) trace('render', 'debug', '', `array kids=${kidsSeq(arr)} fid=${fid ?? '-'} key=${key ?? '-'}`)
  // 数组项边界标记带身份：key 必写（父数组下标/显式 key）；fid = 位置路径（父 fid + 下标）——
  // start/end 共享 fid，嵌套数组项 fid 不同——end 配对精确（不干扰外层配对）
  const fragStart = b.createComment(holeMarkup({ type: 'fragment-start', key, id, fid }))
  const fragEnd = b.createComment(holeMarkup({ type: 'fragment-end', key, id, fid }))
  if (fragStart) frag.appendChild(fragStart)
  for (let i = 0; i < arr.length; i++) {
    const c = arr[i]
    const childFid = fid != null ? `${fid}-${i}` : String(i)
    const n = renderChild(c, ctx, b, i, childFid)
    if (n != null) frag.appendChild(n)
  }
  if (fragEnd) frag.appendChild(fragEnd)
  return frag
}

/** Portal：渲染到 #__wf_portal（body） */
function renderPortal(v: VNodeChild, ctx: any, b: BrowserEnv): Node | null {
  const vnode = v as VNode
  const pv = vnode as PortalVNode
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
    // 补父链：portal children 指向 portal vnode（_parentVNode 链完整性——
    // dispose 传播基础：portal 内容被独立清理时（popup 关闭）可沿链找到父树）
    const pkids = arrayChildren(vnode.props?.children)
    for (const pk of pkids) {
      if (pk != null && typeof pk === 'object' && !Array.isArray(pk)) (pk as VNode)._parentVNode = vnode
    }
  }
  return null
}

/** Fragment：多节点输出——fragment-start/end 标记包裹（与数组项同构——统一多节点定位
 * 为 DOM 持久化边界；_childNodes 缓存已删除——范围由标记推导，随 DOM 天然同步） */
function renderFrag(v: VNodeChild, ctx: any, b: BrowserEnv, key: string | null = null, id: string | null = null, fid: string | null = null): Node | null {
  const vnode = v as VNode
  const fv = vnode as FragVNode
  const frag = b.createDocumentFragment()
  if (!frag) return null
  const kidsArr = arrayChildren(vnode.props?.children)
  if (traceEnabled('render')) trace('render', 'debug', '', `fragment kids=${kidsSeq(kidsArr)} fid=${fid ?? '-'}`)
  // 边界标记带身份：fid = 位置路径（父 fid + 下标——嵌套 Fragment/数组项配对精确）
  const fragStart = b.createComment(holeMarkup({ type: 'fragment-start', key, id, fid }))
  const fragEnd = b.createComment(holeMarkup({ type: 'fragment-end', key, id, fid }))
  if (fragStart) frag.appendChild(fragStart)
  fv._refNode = fragStart  // 统一锚点：输出范围首节点（Fragment = start 标记）
  for (let i = 0; i < kidsArr.length; i++) {
    const c = kidsArr[i]
    const childFid = fid != null ? `${fid}-${i}` : String(i)
    const n = renderChild(c, ctx, b, i, childFid)
    if (n != null) frag.appendChild(n)
  }
  if (fragEnd) frag.appendChild(fragEnd)
  return frag
}

/** 组件：渲染输出——生命周期状态机查表分派（RENDER_COMP[lifecycle]——无 if/else 链）。
 *  渲染行为完全由生命周期状态决定：
 *  - built/pruned：正常渲染（_child 递归——输出 null 或 vnode）
 *  - disposed   ：占位兜底（剪枝缓存失效——父树重建中）
 *  - fresh      ：未构建（build 缺陷——抛错暴露）
 *  - building   ：构建中（diff 同步上下文不该遇到——抛错暴露） */
function renderComp(v: VNodeChild, ctx: any, b: BrowserEnv): Node | null {
  const cv = v as CompVNode
  // 手写 vnode（测试/命令式）无 _lifecycle——按 _render 推断（有 → built；无 → fresh）
  const lc = cv._lifecycle ?? (typeof cv._render === 'function' ? 'built' : 'fresh')
  return RENDER_COMP[lc](cv, ctx, b)
}

/** 组件渲染状态机表（生命周期状态 → 渲染行为） */
const RENDER_COMP: Record<Lifecycle, (cv: CompVNode, ctx: any, b: BrowserEnv) => Node | null> = {
  /** fresh：未构建（build 缺陷——diff 收到未构建组件） */
  fresh: (cv, _ctx, _b) => {
    throw new Error(`[vdom2] component ${componentName(cv.type)} not built (missing _render) — buildVNode must run before renderValue`)
  },
  /** building：构建中（diff 同步上下文不该遇到——异步工厂未 resolve） */
  building: (cv, _ctx, _b) => {
    throw new Error(`[vdom2] component ${componentName(cv.type)} building in render — buildVNode must await before renderValue`)
  },
  /** disposed：剪枝缓存失效（portal 内容独立 dispose）——占位 + warn（父树重建中） */
  disposed: (cv, _ctx, b) => {
    console.warn(`[vdom2] disposed 组件 ${componentName(cv.type)} 在渲染——剪枝缓存失效——父树重建中（占位兜底）`)
    return createHole(b, null)
  },
  /** built/pruned：正常渲染（输出 null 或 vnode——_child 递归） */
  built: renderCompBuilt,
  pruned: renderCompBuilt,
}

/** built/pruned 渲染：_child 递归 + 输出锚点 + data-wf-id/key */
function renderCompBuilt(cv: CompVNode, ctx: any, b: BrowserEnv): Node | null {
  const childVNode = cv._child
  // 构建后输出 null（组件条件渲染合法——_render 已设则 null 是输出非未构建）
  if (childVNode == null) {
    cv._child = null
    return null
  }
  cv._child = childVNode
  // 输出 vnode 引用（独立于 dispose 清空的 _child 链——getOutputRange 递归终点）
  cv._outputChild = childVNode
  if (typeof childVNode === 'object' && !Array.isArray(childVNode)) (childVNode as VNode)._parentVNode = cv
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
  const nv = vnode as NativeVNode
  const tag = vnode.type as string
  const el = SVG_TAGS.has(tag) ? b.createElementNS('http://www.w3.org/2000/svg', tag) : b.createElement(tag as keyof HTMLElementTagNameMap)
  if (!el) return null
  nv.el = el
  nv._refNode = el  // 统一锚点：输出范围首节点（native = 元素本身）
  if (traceEnabled('render')) trace('render', 'trace', '', `native <${tag}> key=${vnode.key ?? '-'} kids=${kidsSeq(arrayChildren(vnode.props?.children))}`)
  if (vnode.key != null) el.setAttribute('data-wf-key', vnode.key)

  // select value 延后设置（options 生成前设置无效）
  let selectValue: string | null = null
  for (const [k, value] of Object.entries(vnode.props ?? {})) {
    if (k === 'children' || k === 'key') continue
    if (k === 'value' && el instanceof HTMLSelectElement) { selectValue = value; continue }
    setProp(el, k, value)
  }
  if (!('innerHTML' in (vnode.props ?? {}))) {
    // children 锚点统一：每项渲染时已设 _refNode（native=el / Frag=start 标记 / 组件=输出首节点）
    // ——diff 的 oldNodes 映射从 _refNode 推导（_childAnchors 缓存已删除——冗余 + 双锚点体系）
    const elChildren = arrayChildren(vnode.props?.children)
    for (let i = 0; i < elChildren.length; i++) {
      const c = elChildren[i]
      const childFid = fid != null ? `${fid}-${i}` : String(i)
      const n = renderChild(c, ctx, b, i, childFid)
      if (n == null) continue
      el.appendChild(n)
      if (c && typeof c === 'object' && !Array.isArray(c) && typeof (c as VNode).type === 'function') {
        const cv = c as VNode
        if (!cv._parentNode) {
          cv._parentNode = el
          // _refNode 已由 renderComp 设（输出首节点——非 DocumentFragment）——此处只补 _parentNode
          // （覆盖为 n=DocumentFragment 会让 keyed diff 的锚点失效——comp→frag 残留 bug）
        }
      }
    }
    if (traceEnabled('render')) trace('render', 'trace', '', `native <${tag}> out=${childNodesSeq(el)}`)
  }
  if (selectValue !== null) {
    ;(el as HTMLSelectElement).value = String(selectValue)
  }
  return el
}

/** 渲染函数表（按 classifyKind 分派——每类一个实现，无 if-else 类型链） */
export const RENDERERS: Record<string, (v: VNodeChild, ctx: any, b: BrowserEnv, key?: string | null, id?: string | null, fid?: string | null) => Node | null> = {
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
