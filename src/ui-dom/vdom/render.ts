/**
 * vdom/render — DOM 落地（阶段 2 同步）
 *
 * **只处理已构建的组件**（`_render` 已设——buildVNode 已 await 工厂）。
 * 遇未构建组件 → 抛错（开发期暴露 bug；生产路径 renderByIds 先 build 后 patch，
 * 不会出现未构建组件）。
 */

import type { VNode, VNodeChild } from '../vnode.ts'
import type { BrowserEnv } from '../types.ts'
import { Fragment, Portal, arrayChildren } from '../vnode.ts'
// 单一规则源（阶段 0）：children/属性判定从 transform.ts 导入——禁止各路径各自实现
import { EVENT_RE, eventTarget, ENUMERATED_VALUE_BASED, holeDetail, holeMarkup } from './transform.ts'
// re-export（diff.ts 等消费方保持从 render.ts 导入的既有路径）
export { EVENT_RE, eventTarget, ENUMERATED_VALUE_BASED, holeDetail, holeMarkup } from './transform.ts'
import { UNITLESS_PROPS } from './transform.ts'

export const SVG_TAGS = new Set(['svg', 'path', 'circle', 'rect', 'line', 'polyline', 'polygon', 'g', 'text', 'defs', 'use', 'clipPath'])

export function setProp(el: Element, key: string, value: any): void {
  if (value == null) return
  const b = el.ownerDocument?.defaultView as any
  // enumerated value-based：即使 false 也显式写 'true'/'false'（空字符串解析为 false——
  // draggable 事故；规则表 §2：显式可预期，不依赖「不设 = 默认值」的隐式行为）
  if (ENUMERATED_VALUE_BASED.has(key)) {
    el.setAttribute(key, value ? 'true' : 'false')
    return
  }
  if (value === false) return
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
        else if (k.startsWith('--')) { st.setProperty(k, String(v)) }  // CSS 变量必须 setProperty（st['--x']=v 静默失败——--wf-cols 事故，v1 处理）
        else if (typeof v === 'number' && !UNITLESS_PROPS.has(k)) { (st as any)[k] = `${v}px` }  // 数字加 px（top/left/width 等——无单位值被浏览器忽略 → 坐标丢失）
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
    const { type, capture } = eventTarget(key)
    // 类型守卫：非函数值（onClick={true} / 字符串）不抛错——warn + 跳过，不中断渲染管线
    if (typeof value !== 'function') {
      console.warn(`[weifuwu] event prop ${key} expects a function, got ${typeof value} — ignored`)
      return
    }
    el.addEventListener(type, value, capture ? { capture: true } : undefined)
    return
  }
  if (key === 'value') {
    ;(el as HTMLInputElement).value = value
    return
  }
  if (key === 'indeterminate') {
    // input[type=checkbox] 半选态：property 而非 attribute——setAttribute('indeterminate','')
    // 解析为 false（同 draggable 枚举坑）；el.indeterminate = true 才有效
    ;(el as HTMLInputElement).indeterminate = !!value
    return
  }
  if (key === 'innerHTML') {
    el.innerHTML = String(value ?? '')
    return
  }
  if (key.startsWith('aria-') && typeof value === 'boolean') {
    // aria-* 枚举语义属性（同 draggable）：aria-expanded="" 解析为非标准值——boolean 必须显式 'true'/'false'
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

/** 占位内容（规则表 §1——wf-hole 内容可见可审计：false/null/undefined/true/对象摘要/bad-vnode） */
/** 创建占位节点（数组上下文的无渲染值 → 注释节点，childNodes 与数组同构——规则表 §1） */
export function createHole(browser: BrowserEnv, v: unknown): Node | null {
  return browser.createComment(holeMarkup({ type: 'hole', value: v }))
}

/** 递归渲染（同步——组件必须已构建） */
export function renderValue(v: VNodeChild, ctx: any, browser?: BrowserEnv, key?: string | null, id?: string | null): Node | null {
  const b = (ctx?.browser ?? browser) as BrowserEnv
  if (!b) throw new Error('[vdom] renderValue requires browser env (ctx.browser)')
  if (v == null || typeof v === 'boolean') return null
  if (typeof v === 'string' || typeof v === 'number') return b.createTextNode(String(v))
  if (Array.isArray(v)) {
    const frag = b.createDocumentFragment()
    if (!frag) return null
    // 数组项 = 隐式 Fragment（规则表 §1-20）：DOM 边界标记——数组项展开后边界在 DOM 持久化
    // （fragment-start/end 注释，与占位注释 wf-hole 同族——不改变 DOM 结构，非用户内容）。
    // 标记带数组项身份：key 必写（父数组下标/显式 key——规则表 §3-46 层级独立）；id 有则写
    // （数组项无 vnode 身份时省略——组件/元素 id 走 data-wf-id 不重复）。diff 直接读注释定位
    const fragStart = b.createComment(holeMarkup({ type: 'fragment-start', key, id }))
    const fragEnd = b.createComment(holeMarkup({ type: 'fragment-end', key, id }))
    if (fragStart) frag.appendChild(fragStart)
    for (let i = 0; i < v.length; i++) {
      const c = v[i]
      // 数组上下文：无渲染值（false/null/true）→ 占位节点（childNodes 长度 = 数组长度）；
      // 内层项下标传给嵌套数组项（多层嵌套 key 层级独立）
      const n = c == null || typeof c === 'boolean' ? createHole(b, c) : renderValue(c, ctx, b, String(i))
      if (n != null) frag.appendChild(n)
    }
    if (fragEnd) frag.appendChild(fragEnd)
    return frag
  }
  const vnode = v as VNode

  // 非法 vnode（type 非 string/function/Fragment/Portal）→ 诊断占位 + warn（规则表 §1：
  // 不崩溃、不静默——用户写错可直接从 DOM 注释看到原因；对齐事件 prop 非函数守卫先例）
  const vt = vnode.type
  if (typeof vt !== 'string' && typeof vt !== 'function' && vt !== Fragment && vt !== Portal) {
    console.warn(`[weifuwu] children 项非法：type=${String(vt)}（${typeof vt}），值=${holeDetail(v)}——已占位（wf-hole），检查传入的 children`)
    return createHole(b, v)
  }

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
    // P-5：arrayChildren 统一展开（替代 flat(Infinity) 重复展开）；数组上下文无渲染值 → 占位
    for (const c of arrayChildren(vnode.props?.children)) {
      const n = c == null || typeof c === 'boolean' ? createHole(b, c) : renderValue(c, ctx, b)
      if (n != null) frag.appendChild(n)
    }
    vnode._childNodes = Array.from(frag.childNodes) as Node[]
    return frag
  }

  if (typeof vnode.type === 'function') {
    // 组件必须已构建（buildVNode await 工厂 + renderFn）——renderFn 强制异步，
    // renderValue 同步上下文永不执行 renderFn（拿不到 vnode，只拿到 Promise）
    if (typeof vnode._render !== 'function') {
      throw new Error(`[vdom] component ${(vnode.type as any).name || 'anonymous'} not built (missing _render) — buildVNode must run before renderValue`)
    }
    if (vnode._child === undefined) {
      throw new Error(`[vdom] component ${(vnode.type as any).name || 'anonymous'} not built (missing _child) — buildVNode must run before renderValue`)
    }
    const childVNode = vnode._child
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
    if (node) {
      vnode._refNode = node
      // 规则表 §4：组件实例 id → 输出每个顶层节点 data-wf-id（多根输出全部写；
      // 定位 renderByIds / audit 校验 / debug）
      if (vnode._id) {
        if (node.nodeType === 11) {
          for (const cn of Array.from(node.childNodes)) {
            if (cn.nodeType === 1) (cn as Element).setAttribute('data-wf-id', vnode._id)
          }
        } else if (node.nodeType === 1) {
          ;(node as Element).setAttribute('data-wf-id', vnode._id)
        }
      }
      // 规则表 §3：组件数组项 key → 输出每个顶层节点 data-wf-key（与元素项行为一致——
      // 列表项身份在 DOM 完全可见；多根输出全部写）
      if (vnode.key != null) {
        if (node.nodeType === 11) {
          for (const cn of Array.from(node.childNodes)) {
            if (cn.nodeType === 1) (cn as Element).setAttribute('data-wf-key', vnode.key)
          }
        } else if (node.nodeType === 1) {
          ;(node as Element).setAttribute('data-wf-key', vnode.key)
        }
      }
    }
    return node
  }

  // Native
  const tag = vnode.type as string
  const el = SVG_TAGS.has(tag)
    ? b.createElementNS('http://www.w3.org/2000/svg', tag)
    : b.createElement(tag as any)
  if (!el) return null
  vnode.el = el
  // 规则表 §3：数组项 key → data-wf-key（显式原文/默认下标值，DOM 可见——零隐藏状态）
  if (vnode.key != null) el.setAttribute('data-wf-key', vnode.key)

  // select value 延后设置（v1 处理）：options 生成前设置 select.value 无效——
  // 必须在 children（option）渲染后赋值
  let selectValue: any
  for (const [key, value] of Object.entries(vnode.props ?? {})) {
    if (key === 'children' || key === 'key') continue
    if (key === 'value' && el instanceof HTMLSelectElement) { selectValue = value; continue }
    setProp(el, key, value)
  }
  if (!('innerHTML' in (vnode.props ?? {}))) {
    // P-5：arrayChildren 统一展开（替代 flat(Infinity) 重复展开）；数组上下文无渲染值 → 占位
    // 阶段 B：记录 children 每位置的首 DOM 节点（_childAnchors——替代 source[i] 下标猜测，
    // fragment/数组项多节点展开后相邻项不错位——规则表 §5）
    const anchors: (Node | null)[] = []
    const elChildren = arrayChildren(vnode.props?.children)
    for (let i = 0; i < elChildren.length; i++) {
      const c = elChildren[i]
      // 数组项（隐式 Fragment）边界标记带外层下标 key（规则表 §3-46 层级独立——data-wf-key
      // 与 fragment 标记 key 同源；组件 id 由 renderValue 内部落 data-wf-id）
      const n = c == null || typeof c === 'boolean' ? createHole(b, c) : renderValue(c, ctx, b, String(i))
      if (n == null) { anchors.push(null); continue }
      // appendChild 前记录锚点（数组项 = 隐式 Fragment：n 是 DocumentFragment——appendChild
      // 展开子节点后 fragment 变空，firstChild 读不到——锚点必须是展开前首节点）
      const anchorNode = n.nodeType === 11 ? (n.firstChild as Node | null) : n
      el.appendChild(n)
      anchors.push(anchorNode)
      // 子组件 DOM 锚点（精准刷新定位）
      if (c && typeof c === 'object' && !Array.isArray(c) && typeof (c as VNode).type === 'function') {
        const cv = c as VNode
        if (!cv._parentNode) {
          cv._parentNode = el
          cv._refNode = n
        }
      }
    }
    vnode._childAnchors = anchors
  }
  // select value 在 options 生成后设置（v1 处理——value 属性延后）
  if (selectValue !== undefined) {
    ;(el as HTMLSelectElement).value = String(selectValue)
  }
  return el
}
