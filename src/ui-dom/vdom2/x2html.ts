/**
 * vdom2 x2html — vnode → HTML 字符串（SSR）
 *
 * 与 renderValue（客户端 DOM）同一**类型遍历**——TO_HTML[classifyKind(v)] 分派：
 * 每个类型一个渲染实现，SSR/客户端结构同构（数组边界标记/占位注释/属性规则同一单一规则源
 * transform.ts），hydration 不 mismatch。
 *
 * 与客户端的差异（SSR 语义）：
 * - 组件：现场执行工厂 + renderFn（无预构建——SSR 服务端每次渲染）
 * - Portal：就地内联子节点（客户端 portal 渲染到 #__wf_portal——SSR 内联保留内容/SEO）
 * - 事件 props 剥离（hydration 接线）；ref 剥离
 */

import type { VNode, VNodeChild } from '../vnode.ts'
import { isFrag, isComp, isPortal, isNative, Fragment, Portal } from '../vnode.ts'
import { classifyKind, type VKind } from './kind.ts'
import { componentName } from './ctx.ts'
import { holeMarkup, ENUMERATED_VALUE_BASED } from './transform.ts'
import { ensureArrayKeys } from './transform.ts'

export function escape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function classToString(v: any): string {
  if (typeof v === 'string') return v
  if (Array.isArray(v)) return v.filter(Boolean).join(' ')
  if (v && typeof v === 'object') return Object.entries(v).filter(([, on]) => on).map(([k]) => k).join(' ')
  return ''
}

function styleToString(v: Record<string, any>): string {
  return Object.entries(v)
    .filter(([, val]) => val != null && val !== false)
    .map(([k, val]) => `${k}:${typeof val === 'number' ? val : String(val)}`)
    .join(';')
}

const VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'])
const SVG_TAGS = new Set(['svg', 'path', 'circle', 'rect', 'line', 'polyline', 'polygon', 'g', 'text', 'defs', 'use', 'clipPath'])

type HtmlCtx = {
  _fidPath?: string
  [key: string]: any
}

/** vnode → HTML（SSR）——类型分派主入口 */
export async function x2html(input: VNodeChild, ctx: HtmlCtx): Promise<string> {
  return TO_HTML[classifyKind(input)](input, ctx)
}

// ── 各类型 → HTML ──

async function holeToHtml(v: VNodeChild, ctx: HtmlCtx): Promise<string> {
  return '' // 顶层占位无输出（数组内占位由数组分支输出注释——与客户端 renderValue 对齐）
}

async function textToHtml(v: VNodeChild, ctx: HtmlCtx): Promise<string> {
  return escape(String(v))
}

/** 数组项 = 隐式 Fragment：fragment-start/end 注释 + 内容（与客户端 renderValue 同构） */
async function arrToHtml(v: VNodeChild, ctx: HtmlCtx): Promise<string> {
  const arr = v as VNodeChild[]
  ensureArrayKeys(arr)
  const fidBase = ctx._fidPath
  const parts = await Promise.all(arr.map(async (c, i) => {
    const childFid = fidBase != null ? `${fidBase}-${i}` : String(i)
    if (c == null || typeof c === 'boolean') return `<!--${holeMarkup({ type: 'hole', value: c, key: null, id: null, fid: null })}-->`
    if (Array.isArray(c)) {
      const inner = await x2html(c, { ...ctx, _fidPath: childFid })
      return `<!--${holeMarkup({ type: 'fragment-start', key: String(i), id: null, fid: childFid })}-->${inner}<!--${holeMarkup({ type: 'fragment-end', key: String(i), id: null, fid: childFid })}-->`
    }
    const html = await x2html(c, ctx)
    // 组件输出 null（值层有值、渲染层无输出）→ 输出占位注释（与客户端 renderArray 同构——
    // 数组项槽位在 SSR HTML 必须有节点，否则 hydrate 游标/后续 diff 错位）
    return html === '' ? `<!--${holeMarkup({ type: 'hole', value: null, key: null, id: null, fid: null })}-->` : html
  }))
  return parts.join('')
}

/** Fragment：fragment-start/end 标记 + 内容（与客户端 renderFrag 同构——统一多节点定位协议；
 *  数组项（arrToHtml）同款；fid 传递——嵌套 Fragment/数组项配对精确） */
async function fragToHtml(v: VNodeChild, ctx: HtmlCtx): Promise<string> {
  const vnode = v as VNode
  const fid = ctx._fidPath ?? null
  const inner = await x2html(vnode.props?.children, { ...ctx, _fidPath: fid ?? undefined })
  return `<!--${holeMarkup({ type: 'fragment-start', key: null, id: null, fid })}-->${inner}<!--${holeMarkup({ type: 'fragment-end', key: null, id: null, fid })}-->`
}

/** Portal：就地内联子节点（客户端 portal 远程渲染——SSR 内联保留内容/SEO） */
async function portalToHtml(v: VNodeChild, ctx: HtmlCtx): Promise<string> {
  const vnode = v as VNode
  return x2html(vnode.props?.children, ctx)
}

/** 组件：现场执行工厂 + renderFn（SSR 无预构建）——输出顶层注入 data-wf-key（与客户端一致） */
async function compToHtml(v: VNodeChild, ctx: HtmlCtx): Promise<string> {
  const vnode = v as VNode
  const childCtx = Object.create(ctx) as HtmlCtx
  // 组件输出 = fid 根（与客户端 renderValue 组件分支不传 fid——数组项路径重置）
  delete childCtx._fidPath
  const renderFn = await (vnode.type as (p: Record<string, any>, c: any) => Promise<(p: Record<string, any>) => Promise<VNode | null>>)(vnode.props ?? {}, childCtx)
  if (typeof renderFn !== 'function') {
    throw new Error(
      `Component ${componentName(vnode.type)} must return a render function. ` +
        `Use (init_props, ctx) => (props) => VNode pattern.`,
    )
  }
  const out = await renderFn(vnode.props ?? {})
  if (vnode.key != null && out != null && typeof out === 'object') {
    if (Array.isArray(out)) {
      for (const c of out) if (c != null && typeof c === 'object' && !Array.isArray(c)) (c as VNode).key = vnode.key
    } else {
      ;(out as VNode).key = vnode.key
    }
  }
  return x2html(out, childCtx)
}

/** Native：标签 + 属性（class/style/enumerated/data-wf-key）+ children 递归 */
async function nativeToHtml(v: VNodeChild, ctx: HtmlCtx): Promise<string> {
  const vnode = v as VNode
  const tag = vnode.type as string
  const props = vnode.props ?? {}
  const attrs: string[] = []
  let innerHTML: string | null = null
  if (vnode.key != null) attrs.push(` data-wf-key="${escape(String(vnode.key))}"`)
  for (const [key, value] of Object.entries(props)) {
    if (key === 'children' || key === 'key') continue
    if (key === 'ref') continue
    if (key.startsWith('on') && typeof value === 'function') continue // 事件剥离（hydration 接线）
    if (key === 'innerHTML') { innerHTML = String(value ?? ''); continue }
    if (key === 'class' || key === 'className') {
      const cls = classToString(value)
      if (cls) attrs.push(` class="${escape(cls)}"`)
      continue
    }
    if (key === 'style' && value && typeof value === 'object') {
      attrs.push(` style="${escape(styleToString(value))}"`)
      continue
    }
    if (ENUMERATED_VALUE_BASED.has(key)) {
      attrs.push(` ${key}="${value ? 'true' : 'false'}"`)
      continue
    }
    if (value === true) { attrs.push(` ${key}`); continue }
    if (value === false || value == null) continue
    attrs.push(` ${key}="${escape(String(value))}"`)
  }
  const attrStr = attrs.join('')
  const svgWrap = SVG_TAGS.has(tag)
  if (VOID_TAGS.has(tag)) return `<${tag}${attrStr}>`
  if (innerHTML !== null) return `<${tag}${attrStr}>${innerHTML}</${tag}>`
  const children = await x2html(props.children, ctx)
  if (svgWrap) return `<${tag}${attrStr}>${children}</${tag}>`
  return `<${tag}${attrStr}>${children}</${tag}>`
}

/** 类型分派表（与客户端 renderValue 同一 classifyKind——SSR/客户端结构同构） */
const TO_HTML: Record<VKind, (v: VNodeChild, ctx: HtmlCtx) => Promise<string>> = {
  hole: holeToHtml,
  text: textToHtml,
  arr: arrToHtml,
  portal: portalToHtml,
  frag: fragToHtml,
  comp: compToHtml,
  native: nativeToHtml,
}

export { Fragment, Portal }
export { isFrag, isComp, isPortal, isNative }
