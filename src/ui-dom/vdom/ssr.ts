/**
 * vdom/ssr — 服务端渲染（无 DOM，纯字符串）
 *
 * SSR 与引擎无关（vnode → HTML 字符串）——vdom 独立实现：
 * - renderSsr：await 工厂 → renderFn → 递归（组件签名两阶段 async）
 * - createSsrContext：SSR ctx shim（hooks no-op、$ 普通对象、ctx.data 预取）
 * - ssrPage：router.execute → renderSsr → 完整 HTML（__DATA__ 种子）
 *
 * 渲染期非确定性（Date/Math.random/locale）导致 SSR/hydration mismatch——
 * dev 检测，文档红线（AGENTS.md §3.5 诚实裁剪）。
 */

import type { VNode, VNodeChild, Component } from '../vnode.ts'
import type { WfuiContext, UIContext } from '../types.ts'
import { Fragment, Portal } from '../vnode.ts'
import type { UIRouter } from '../router.ts'
// 单一规则源（阶段 0）：与客户端 renderValue 共用 children/属性判定（design/vdom-consistency-plan.md）
import { holeDetail, holeMarkup, ensureArrayKeys, isInvalidVNodeType, ENUMERATED_VALUE_BASED } from './transform.ts'

const VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'])
const SVG_TAGS = new Set(['svg', 'path', 'circle', 'rect', 'line', 'polyline', 'polygon', 'g', 'text', 'defs', 'use', 'clipPath'])

/** HTML 转义（文本/属性值） */
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
  // 对齐 v1 序列化：数字加 px（非 0）+ 无空格分隔（紧凑）
  return Object.entries(v)
    .filter(([, val]) => val != null)
    .map(([k, val]) => {
      const key = k.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())
      const value = typeof val === 'number' && val !== 0 ? `${val}px` : String(val)
      return `${key}:${value}`
    })
    .join(';')
}

/** 渲染 vnode → HTML 字符串（服务端） */
export async function renderSsr(input: VNodeChild, ctx: WfuiContext): Promise<string> {
  if (input == null || typeof input === 'boolean') return ''
  if (typeof input === 'string' || typeof input === 'number') return escape(String(input))
  if (Array.isArray(input)) {
    // 阶段 A-3/K：与客户端 buildVNode/renderValue 对齐——数组项默认下标 key（字符串化）+
    // 数组上下文无渲染值 → 占位注释；数组项（隐式 Fragment）输出边界标记
    // （fragment-start/end 注释——与客户端 renderValue 同族，hydration 不 mismatch）
    ensureArrayKeys(input)
    const parts = await Promise.all(input.map((c) => {
      if (c == null || typeof c === 'boolean') return Promise.resolve(`<!--${holeMarkup({ type: 'hole', value: c })}-->`)
      return renderSsr(c, ctx)
    }))
    // 数组项（内层数组）边界标记：key = 外层下标（层级独立——与客户端 renderValue 同格式）
    const hasArrayItem = input.some((c) => Array.isArray(c))
    const fragStart = hasArrayItem ? `<!--${holeMarkup({ type: 'fragment-start', key: String(input.findIndex(Array.isArray)) })}-->` : ''
    const fragEnd = hasArrayItem ? `<!--${holeMarkup({ type: 'fragment-end', key: String(input.findIndex(Array.isArray)) })}-->` : ''
    return fragStart + parts.join('') + fragEnd
  }

  const vnode = input as VNode

  // 非法 vnode（type 非 string/function/Fragment/Portal）→ 诊断占位 + warn（规则表 §1——
  // 与客户端 renderValue 同一判定，单一规则源）
  if (isInvalidVNodeType(vnode.type)) {
    console.warn(`[weifuwu] children 项非法：type=${String(vnode.type)}（${typeof vnode.type}）——已占位（wf-hole）`)
    return `<!--${holeMarkup({ type: 'hole', value: input })}-->`
  }

  // Portal/Fragment：就地内联子节点（客户端 portal 渲染到 #__wf_portal，SSR 内联保留内容/SEO）
  if (vnode.type === Portal || vnode.type === Fragment) return renderSsr(vnode.props?.children, ctx)

  // 组件（统一签名：async 工厂 → Promise<renderFn>）
  if (typeof vnode.type === 'function') {
    const childCtx = Object.create(ctx) as WfuiContext
    const renderFn = await (vnode.type as Component)(vnode.props ?? {}, childCtx)
    if (typeof renderFn !== 'function') {
      throw new Error(
        `Component ${(vnode.type as any).name || 'anonymous'} must return a render function. ` +
          `Use (init_props, ctx) => (props) => VNode pattern.`,
      )
    }
    const out = await renderFn(vnode.props ?? {})
    // 规则表 §3：组件数组项 key → 输出顶层节点 data-wf-key（与客户端 renderValue 一致——
    // 渲染期临时注入 renderFn 输出（每次重建的临时产物，非用户 vnode 的持久改写）；多根每个注入）
    if (vnode.key != null && out != null && typeof out === 'object') {
      if (Array.isArray(out)) {
        for (const c of out) {
          if (c != null && typeof c === 'object' && !Array.isArray(c)) (c as VNode).key = vnode.key
        }
      } else {
        ;(out as VNode).key = vnode.key
      }
    }
    return renderSsr(out, childCtx)
  }

  // Native
  const tag = vnode.type as string
  const props = vnode.props ?? {}
  const attrs: string[] = []
  let innerHTML: string | undefined
  // 规则表 §3：数组项 key → data-wf-key（与客户端 renderValue 同位置输出——SSR/客户端同构）
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
    // enumerated value-based（规则表 §2——与客户端 setProp 同一白名单，单一规则源）
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
  if (innerHTML !== undefined) return `<${tag}${attrStr}>${innerHTML}</${tag}>`
  const children = await renderSsr(props.children, ctx)
  if (svgWrap) return `<${tag}${attrStr}>${children}</${tag}>`
  return `<${tag}${attrStr}>${children}</${tag}>`
}

/** SSR 版 ctx.ui（hooks no-op——服务端组件 SSR 安全） */
function createSsrUi(): any {
  const noop = () => () => {}
  const noopReturn = () => ({})
  return {
    _selfId: '_wf_root',
    render: () => {},
    selfId: () => {},
    bumpCtxVersion: () => {},
    setMounting: () => {},
    endMounting: () => {},
    onUnmount: () => undefined,
    // hooks no-op（组件 SSR 安全——不注册监听/定时器）
    useChat: () => ({ messages: [], input: '', streaming: false, error: null, usage: null, step: null, send: () => {}, stop: () => {}, retry: () => {}, clear: () => {}, approve: () => {}, subscribe: () => () => {} }),
    useExternal: (store: any) => store,
    useMedia: noop,
    useBreakpoint: noop,
    usePopupPosition: () => ({ top: 0, left: 0, refresh: () => {} }),
    useHoverCapable: () => false,
    useStableRef: (init?: any) => (el: any) => { if (el) init?.(el) },
    useVisualViewport: () => ({ height: 0, offsetTop: 0, keyboardOpen: false }),
    usePopup: () => ({ open: false, setOpen: () => {}, phase: 'closed', sync: (open: boolean) => (open ? 'open' : 'closed'), wrapProps: {}, portal: (content: any) => content, refresh: () => {} }),
    useLongPress: noopReturn,
    useInView: () => ({ isIn: false, ready: false, observe: () => {}, refresh: () => {}, disconnect: () => {} }),
    useScrollPosition: () => ({ y: 0, refresh: () => {} }),
    useAsync: () => ({ data: undefined, loading: true, error: undefined, reload: () => {} }),
    useControlled: () => ({ value: undefined, setValue: () => {}, controlled: false }),
    useControlledInput: () => ({ value: undefined, setValue: () => {}, keyword: '', setKeyword: () => {}, selectedLabel: '', setSelectedLabel: () => {}, controlled: false }),
    useOpen: () => ({ open: false, setOpen: () => {}, triggerProps: {} }),
    usePresence: () => ({ phase: 'closed', ref: () => {}, sync: () => 'closed' }),
    useGlobalKey: () => () => {},
    useDrag: noopReturn,
    useDragDrop: () => ({ dropProps: {}, dragProps: {} }),
    useReducedMotion: () => true,  // SSR 无动画——组件直落终值
    useAnimationEnd: () => () => {},
    useTween: (t: number) => {
    // SSR 直落终值：reset 设目标；value 可读写（非动画路径 `tween.value = target`）
    let v = t
    return {
      get value() { return v },
      set value(n: number) { v = n },
      reset: (n?: number) => { if (n !== undefined) v = n; return v },
    }
  },
  }
}

/** 创建 SSR ctx（serverCtx 注入 + dataStore 预取 + hooks shim） */
export function createSsrContext(serverCtx: any, dataStore: Map<string, unknown>): WfuiContext {
  const ctx: any = {
    ...serverCtx,
    ui: createSsrUi(),
    browser: undefined,
  }
  // ctx.data：SSR 预取写入 dataStore（客户端 __DATA__ 种子同步命中）
  const dataCache = new Map<string, { value?: unknown; promise?: Promise<unknown> }>()
  ctx.data = {
    async get<T = any>(key: string, fetcher?: () => Promise<T>): Promise<T> {
      const entry = dataCache.get(key)
      if (entry && 'value' in entry) return entry.value as T
      if (entry?.promise) return entry.promise as Promise<T>
      if (!fetcher) return undefined as T
      const promise = Promise.resolve()
        .then(() => fetcher())
        .then((val) => { dataCache.set(key, { value: val }); dataStore.set(key, val); return val })
      dataCache.set(key, { promise })
      return promise
    },
    set(key: string, value: unknown) { dataCache.set(key, { value }); dataStore.set(key, value) },
    has(key: string) { return dataCache.has(key) },
  }
  return ctx as WfuiContext
}

/** 序列化数据存储 → window.__DATA__ 脚本（防 XSS：转义 <） */
export function serializeData(data: Map<string, unknown>): string {
  const json = JSON.stringify(Object.fromEntries(data)).replace(/</g, '\\u003c')
  return `<script>window.__DATA__=${json};</script>`
}

export interface SsrPageResult {
  html: string
  /** __DATA__ 脚本（hydration 种子） */
  dataScript: string
  /** 完整 HTML（含 dataScript） */
  page: string
}

/**
 * SSR 渲染路由页面 → 完整 HTML（Node 无 DOM）。
 * 客户端 uiServe(router, { root, hydrate: true }) 收养。
 */
export async function ssrPage(
  router: UIRouter,
  opts: { url: string; title?: string; lang?: string; rootId?: string; styles?: string[] },
): Promise<SsrPageResult> {
  const dataStore = new Map<string, unknown>()
  const serverCtx: any = { params: {}, query: {} }
  const ctx = createSsrContext(serverCtx, dataStore) as unknown as UIContext

  const path = opts.url.split('?')[0].split('#')[0]
  const match = router.match(path)
  ctx.params = match.params
  ctx.query = Object.fromEntries(new URLSearchParams(opts.url.split('?')[1] ?? ''))

  const location = new URL(opts.url.startsWith('http') ? opts.url : `http://localhost${opts.url.startsWith('/') ? opts.url : '/' + opts.url}`) as unknown as Location

  const vnode = await router.execute(location, ctx, path)

  const html = await renderSsr(vnode, ctx)
  const dataScript = serializeData(dataStore)
  const title = match.title ?? opts.title ?? ''
  const rootId = opts.rootId ?? 'root'
  const styleLinks = (opts.styles ?? []).map((s) => `  <link rel="stylesheet" href="${s}">`).join('\n')
  const page = `<!DOCTYPE html>
<html lang="${opts.lang ?? 'zh-CN'}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  ${title ? `<title>${title}</title>` : ''}
  ${styleLinks}
</head>
<body>
  <div id="${rootId}">${html}</div>
  ${dataScript}
  <script src="/app.js"></script>
</body>
</html>`

  return { html, dataScript, page }
}

/** SSR 渲染组件 → HTML 片段 */
export async function ssrToString(
  Comp: Component,
  props: Record<string, any>,
  serverCtx: any,
  opts: { data?: Map<string, unknown> } = {},
): Promise<string> {
  const dataStore = opts.data ?? new Map<string, unknown>()
  const ctx = createSsrContext(serverCtx, dataStore)
  return renderSsr({ type: Comp, props: props ?? {}, key: undefined }, ctx)
}
