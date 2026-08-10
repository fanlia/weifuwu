/**
 * 服务端 SSR 字符串遍历器 — async 工厂组件（形态 C）的 HTML 序列化
 *
 * 支持：
 *   - 同步组件（mount → render → VNode → HTML）
 *   - async 工厂组件（await 工厂 → 数据进 HTML；服务端不缓存定义，数据 per-request）
 *   - Fragment / Portal（内联子节点）
 *   - innerHTML prop（原样输出）、class/style 对象序列化
 *   - 事件处理器 / ref 剥离、文本自动转义（XSS）
 *   - 服务端 ctx shim（$ no-op dirty、ctx.data 预取、selfId 隔离）
 *
 * 产物为 HtmlSafe 标记的安全 HTML 片段，可直接内联进 ctx.ui.html 模板。
 */

import { Fragment, Portal, isAsyncComponent } from '../ui-dom/vnode.ts'
import type { VNode, Component, AsyncComponent } from '../ui-dom/vnode.ts'
import type { WfuiContext } from '../ui-dom/types.ts'
import { createReactiveState } from '../ui-dom/reactive.ts'
import { HtmlSafe } from './html-safe.ts'

export { HtmlSafe } from './html-safe.ts'

function escape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// ── 序列化辅助 ─────────────────────────────────────────

const VOID_TAGS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr',
])

function classToString(v: any): string {
  if (typeof v === 'string') return v
  if (Array.isArray(v)) return v.filter(Boolean).join(' ')
  if (v && typeof v === 'object') {
    return Object.entries(v).filter(([, b]) => b).map(([k]) => k).join(' ')
  }
  return ''
}

function styleToString(v: any): string {
  if (typeof v === 'string') return v
  if (v && typeof v === 'object') {
    return Object.entries(v)
      .filter(([, x]) => x != null)
      .map(([k, x]) => `${k}:${typeof x === 'number' ? x + 'px' : String(x)}`)
      .join(';')
  }
  return ''
}

// ── 服务端 ctx shim ────────────────────────────────────

/**
 * 构建组件 SSR 上下文：
 *   - 继承请求 ctx（params 等）
 *   - ctx.ui：$（dirty no-op）、render/dirty no-op、useMedia 等 no-op、selfId 请求级隔离
 *   - ctx.data：预取缓存（dataStore），同 key 只 fetch 一次；结果供调用方序列化进 __DATA__
 */
function createSsrContext(serverCtx: any, dataStore: Map<string, unknown>): WfuiContext {
  const usedIds = new Set<string>()
  const ui = {
    $: () => createReactiveState(() => {}),
    dirty: () => {},
    render: () => {},
    selfId: (name: string) => {
      if (usedIds.has(name)) throw new Error(`[weifuwu] Duplicate component ID: "${name}"`)
      usedIds.add(name)
    },
    useMedia: () => {},
    useBreakpoint: () => {},
    usePopupPosition: () => ({ top: 0, left: 0, refresh: () => {} }),
    // 新原语族：SSR 确定性 no-op（不启动监听/会话/取数；组件挂载不崩即契约）
    useHoverCapable: () => false,
    useVisualViewport: () => ({ height: 0, offsetTop: 0, keyboardOpen: false }),
    useLongPress: () => ({}),
    useInView: () => ({ isIn: false, ready: false, observe: () => {}, refresh: () => {}, disconnect: () => {} }),
    useScrollPosition: () => ({ y: 0, refresh: () => {} }),
    useStableRef: (init?: any) => (el: any) => { if (el) init?.(el) },
    useGlobalKey: () => () => {},
    useReducedMotion: () => false,
    useAnimationEnd: () => () => {},
    useTween: (target: number) => {
      const handle: any = { value: target, reset: (to: number) => { handle.value = to } }
      return handle // SSR 确定性：reset 直落终值（无 rAF）
    },
    useDrag: () => ({ onPointerDown: () => {} }),
    useDragDrop: () => ({ dropProps: {}, dragProps: {} }),
    useControlled: <T>(options: any) => ({
      value: options.value,
      setValue: (v: T) => { options.onChange?.(v) },
      controlled: options.value !== undefined,
    }),
    useControlledInput: (options: any) => ({
      value: options.value,
      setValue: (v: string) => { options.onChange?.(v) },
      controlled: options.value !== undefined,
      keyword: '',
      setKeyword: () => {},
      selectedLabel: '',
      setSelectedLabel: () => {},
    }),
    useOpen: (options: any) => ({
      get open() { return !!options.open },
      setOpen: (v: boolean) => { options.onOpenChange?.(v) },
      triggerProps: {},
    }),
    useAsync: () => ({ data: undefined, loading: true, error: undefined, reload: () => {} }),
    usePopup: () => ({
      open: false,
      setOpen: () => {},
      wrapProps: {},
      portal: () => null,
      refresh: () => {},
    }),
    usePresence: () => ({
      phase: 'closed',
      ref: () => {},
      sync: (open: boolean) => (open ? 'open' : 'closed'),
    }),
    useDialog: () => ({
      phase: 'closed',
      rootRef: () => {},
      panelRef: () => {},
      sync: (open: boolean) => (open ? 'open' : 'closed'),
    }),
    // SSR 确定性空态：会话不启动（无事件/无网络），仅保证挂载不崩
    useChat: () => ({
      messages: [], input: '', streaming: false, error: null, usage: null, step: null,
      send: () => {}, stop: () => {}, retry: () => {}, clear: () => {},
      approve: async () => {}, dispose: () => {},
    }),
  }
  // 浏览器环境抽象 SSR 安全默认（组件经 ctx.browser 不直接碰 window/document）
  const browser = {
    activeElement: () => null,
    byId: () => null,
    query: () => null,
    createElement: () => null,
    bodyAppend: () => {},
    bodyRemove: () => {},
    copyText: async () => false,
    execCommand: () => false,
    selectionText: () => null,
    getSelection: () => null,
    queryCommandState: () => false,
    queryCommandValue: () => '',
    viewportHeight: () => 0,
    scrollTop: () => 0,
    hash: () => '',
    setHash: () => {},
    timeout: () => 0,
    rootElement: () => null,
    storageGet: () => null,
    storageSet: () => {},
  }
  const ctx = Object.create(serverCtx ?? {}) as any
  ctx.ui = ui
  ctx.browser = browser
  ctx.data = {
    async get<T = any>(key: string, fetcher?: () => Promise<T>): Promise<T> {
      if (dataStore.has(key)) return dataStore.get(key) as T
      if (!fetcher) return undefined as T
      const val = await fetcher()
      dataStore.set(key, val)
      return val
    },
    set(key: string, val: unknown) { dataStore.set(key, val) },
    has(key: string) { return dataStore.has(key) },
  }
  return ctx
}

// ── 遍历器 ─────────────────────────────────────────────

/** 深度优先遍历 VNode 树 → HTML 字符串（async：await 工厂组件） */
async function renderSsr(input: any, ctx: any): Promise<string> {
  if (input == null || typeof input === 'boolean') return ''
  if (typeof input === 'string' || typeof input === 'number') return escape(String(input))
  if (Array.isArray(input)) {
    let s = ''
    for (const c of input) s += await renderSsr(c, ctx)
    return s
  }

  const vnode = input as VNode

  // Portal：就地内联子节点（客户端渲染到 #__wf_portal，SSR 内联保留内容/SEO）
  if (vnode.type === Portal) return renderSsr(vnode.props?.children, ctx)
  if (vnode.type === Fragment) return renderSsr(vnode.props?.children, ctx)

  // 组件（同步或 async 工厂）
  if (typeof vnode.type === 'function') {
    let def: Component
    if (isAsyncComponent(vnode.type)) {
      // 服务端不缓存工厂定义（数据 per-request）；工厂内 ctx.data 由 dataStore 去重
      def = await (vnode.type as AsyncComponent)(ctx)
      if (typeof def !== 'function') {
        throw new Error(
          `asyncComponent factory <${vnode.type.name || 'anonymous'}> must return a Component ` +
            `(initProps, ctx) => (props) => VNode.`
        )
      }
    } else {
      def = vnode.type as Component
    }
    const childCtx = Object.create(ctx)
    const renderFn = def(vnode.props ?? {}, childCtx)
    if (typeof renderFn !== 'function') {
      throw new Error(
        `Component ${(vnode.type as any).name || 'anonymous'} must return a render function. ` +
          `Use (init_props, ctx) => (props) => VNode pattern.`
      )
    }
    return renderSsr(renderFn(vnode.props ?? {}), childCtx)
  }

  // Native element
  const tag = vnode.type as string
  const props = vnode.props ?? {}
  const attrs: string[] = []
  let innerHTML: string | undefined
  for (const [key, value] of Object.entries(props)) {
    if (key === 'children' || key === 'key') continue
    if (key === 'ref') continue
    if (key.startsWith('on') && typeof value === 'function') continue  // 事件剥离（客户端 hydration 时接线）
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
    if (value === true) { attrs.push(` ${key}`); continue }
    if (value === false || value == null) continue
    attrs.push(` ${key}="${escape(String(value))}"`)
  }

  const attrStr = attrs.join('')
  if (VOID_TAGS.has(tag)) return `<${tag}${attrStr}>`
  if (innerHTML !== undefined) return `<${tag}${attrStr}>${innerHTML}</${tag}>`
  const children = await renderSsr(props.children, ctx)
  return `<${tag}${attrStr}>${children}</${tag}>`
}

// ── 入口 ───────────────────────────────────────────────

export interface SsrOptions {
  /** 服务端数据存储：ctx.data 预取结果写入此处，调用方序列化进 __DATA__ */
  data?: Map<string, unknown>
}

/**
 * SSR 渲染组件 → HTML 片段（HtmlSafe 标记，可直接内联进 ctx.ui.html 模板，不二次转义）。
 *
 * ```ts
 * const data = new Map()
 * const html = await ctx.ui.ssr(BlogPage, { slug }, { data })
 * return ctx.ui.html`
 *   <div id="root">${html}</div>
 *   ${ctx.ui.ssrData(data)}
 * `
 * ```
 */
export async function ssrToString(
  Comp: Component | AsyncComponent,
  props: Record<string, any>,
  serverCtx: any,
  opts: SsrOptions = {},
): Promise<HtmlSafe> {
  const dataStore = opts.data ?? new Map<string, unknown>()
  const ctx = createSsrContext(serverCtx, dataStore)
  const html = await renderSsr({ type: Comp, props: props ?? {}, key: undefined }, ctx)
  return new HtmlSafe(html)
}

/** 序列化数据存储 → window.__DATA__ 脚本（防 XSS：转义 <） */
export function serializeData(data: Map<string, unknown>): string {
  const json = JSON.stringify(Object.fromEntries(data)).replace(/</g, '\\u003c')
  return `<script>window.__DATA__=${json};</script>`
}
