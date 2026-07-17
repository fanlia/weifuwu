/**
 * weifuwu/client JSX runtime — TSX 编译目标
 *
 * esbuild: --jsx=automatic --jsxImportSource=weifuwu/client
 * tsconfig: "jsx": "react-jsx", "jsxImportSource": "weifuwu/client"
 *
 * createElement 直接创建真实 DOM 节点。
 * Signal 值自动绑定：.value 变化时只更新对应 DOM 节点。
 * 组件签名：(props, ctx) => JSX
 */

import { type Signal, isSignal, effect } from './signal.ts'
import type { WfuiContext } from './types.ts'

// JSX 全局类型 — 使 <div /> <input /> 等通过类型检查并有属性提示
declare global {
  namespace JSX {
    interface IntrinsicElements {
      // 常用块级元素
      div: HtmlDiv
      span: HtmlSpan
      p: HtmlP
      h1: HtmlH1
      h2: HtmlH2
      h3: HtmlH3
      h4: HtmlH4
      h5: HtmlH5
      h6: HtmlH6
      header: HtmlHeader
      footer: HtmlFooter
      nav: HtmlNav
      main: HtmlMain
      section: HtmlSection
      article: HtmlArticle
      aside: HtmlAside
      pre: HtmlPre
      blockquote: HtmlBlockquote
      figure: HtmlFigure
      address: HtmlAddress

      // 列表
      ul: HtmlUl
      ol: HtmlOl
      li: HtmlLi
      dl: HtmlDl
      dt: HtmlDt
      dd: HtmlDd

      // 表格
      table: HtmlTable
      thead: HtmlThead
      tbody: HtmlTbody
      tr: HtmlTr
      th: HtmlTh
      td: HtmlTd

      // 表单
      form: HtmlForm
      input: HtmlInput
      button: HtmlButton
      select: HtmlSelect
      option: HtmlOption
      textarea: HtmlTextarea
      label: HtmlLabel
      fieldset: HtmlFieldset
      legend: HtmlLegend

      // 媒体
      img: HtmlImg
      video: HtmlVideo
      audio: HtmlAudio
      canvas: HtmlCanvas
      svg: HtmlSvg

      // 链接
      a: HtmlA
      link: HtmlLink

      // 内联
      strong: HtmlStrong
      em: HtmlEm
      b: HtmlB
      i: HtmlI
      u: HtmlU
      s: HtmlS
      mark: HtmlMark
      code: HtmlCode
      small: HtmlSmall
      sub: HtmlSub
      sup: HtmlSup
      abbr: HtmlAbbr
      time: HtmlTime
      br: HtmlBr
      hr: HtmlHr
      wbr: HtmlWbr

      // 其他
      style: HtmlStyle
      script: HtmlScript
      template: HtmlTemplate
      slot: HtmlSlot
      details: HtmlDetails
      summary: HtmlSummary
      dialog: HtmlDialog
      iframe: HtmlIframe
    }

    // ── children 类型 ──

    /** JSX 子节点类型 — 支持文本、节点、Signal、数组、函数 */
    type Children = Node | string | number | boolean | null | undefined | Signal<any> | Children[] | (() => Children)

    // ── 基础属性 ──

    interface WfuiAttributes<T> {
      children?: Children
      class?: string | Signal<string>
      className?: string | Signal<string>
      id?: string
      style?: Record<string, string | undefined>
      title?: string
      lang?: string
      dir?: string
      hidden?: boolean | Signal<boolean>
      tabindex?: number
      accesskey?: string
      draggable?: boolean
      contenteditable?: boolean
      slot?: string
      spellcheck?: boolean
      ref?: (el: T) => void

      // 事件
      onClick?: (e: MouseEvent) => void
      onDblClick?: (e: MouseEvent) => void
      onMouseDown?: (e: MouseEvent) => void
      onMouseUp?: (e: MouseEvent) => void
      onMouseMove?: (e: MouseEvent) => void
      onMouseEnter?: (e: MouseEvent) => void
      onMouseLeave?: (e: MouseEvent) => void
      onKeyDown?: (e: KeyboardEvent) => void
      onKeyUp?: (e: KeyboardEvent) => void
      onKeyPress?: (e: KeyboardEvent) => void
      onFocus?: (e: FocusEvent) => void
      onBlur?: (e: FocusEvent) => void
      onInput?: (e: Event) => void
      onChange?: (e: Event) => void
      onSubmit?: (e: Event) => void
      onScroll?: (e: Event) => void
      onWheel?: (e: WheelEvent) => void
      onTouchStart?: (e: TouchEvent) => void
      onTouchEnd?: (e: TouchEvent) => void
      onTouchMove?: (e: TouchEvent) => void
      onLoad?: (e: Event) => void
      onError?: (e: Event) => void
      onAnimationEnd?: (e: AnimationEvent) => void
      onTransitionEnd?: (e: TransitionEvent) => void

      // data-* 属性：使用 dataset 对象或 (props as any).data-x
      [data: string]: unknown
    }

    // ── 标签特定属性 ──

    type HtmlDiv = WfuiAttributes<HTMLDivElement>
    type HtmlSpan = WfuiAttributes<HTMLSpanElement>
    type HtmlP = WfuiAttributes<HTMLParagraphElement>
    type HtmlH1 = WfuiAttributes<HTMLHeadingElement>
    type HtmlH2 = WfuiAttributes<HTMLHeadingElement>
    type HtmlH3 = WfuiAttributes<HTMLHeadingElement>
    type HtmlH4 = WfuiAttributes<HTMLHeadingElement>
    type HtmlH5 = WfuiAttributes<HTMLHeadingElement>
    type HtmlH6 = WfuiAttributes<HTMLHeadingElement>
    type HtmlHeader = WfuiAttributes<HTMLElement>
    type HtmlFooter = WfuiAttributes<HTMLElement>
    type HtmlNav = WfuiAttributes<HTMLElement>
    type HtmlMain = WfuiAttributes<HTMLElement>
    type HtmlSection = WfuiAttributes<HTMLElement>
    type HtmlArticle = WfuiAttributes<HTMLElement>
    type HtmlAside = WfuiAttributes<HTMLElement>
    type HtmlPre = WfuiAttributes<HTMLPreElement>
    type HtmlBlockquote = WfuiAttributes<HTMLQuoteElement>
    type HtmlFigure = WfuiAttributes<HTMLElement>
    type HtmlAddress = WfuiAttributes<HTMLElement>

    type HtmlUl = WfuiAttributes<HTMLUListElement>
    type HtmlOl = WfuiAttributes<HTMLOListElement>
    type HtmlLi = WfuiAttributes<HTMLLIElement>
    type HtmlDl = WfuiAttributes<HTMLDListElement>
    type HtmlDt = WfuiAttributes<HTMLElement>
    type HtmlDd = WfuiAttributes<HTMLElement>

    type HtmlTable = WfuiAttributes<HTMLTableElement>
    type HtmlThead = WfuiAttributes<HTMLTableSectionElement>
    type HtmlTbody = WfuiAttributes<HTMLTableSectionElement>
    type HtmlTr = WfuiAttributes<HTMLTableRowElement>
    type HtmlTh = WfuiAttributes<HTMLTableCellElement>
    type HtmlTd = WfuiAttributes<HTMLTableCellElement>

    interface HtmlForm extends WfuiAttributes<HTMLFormElement> {
      action?: string
      method?: string
      enctype?: string
      novalidate?: boolean
      target?: string
    }

    interface HtmlInput extends WfuiAttributes<HTMLInputElement> {
      type?: string
      value?: string | Signal<string>
      placeholder?: string
      checked?: boolean | Signal<boolean>
      disabled?: boolean | Signal<boolean>
      readonly?: boolean
      required?: boolean
      autofocus?: boolean
      autocomplete?: string
      name?: string
      min?: string | number
      max?: string | number
      step?: number
      pattern?: string
      accept?: string
      multiple?: boolean
      src?: string
      alt?: string
    }

    interface HtmlButton extends WfuiAttributes<HTMLButtonElement> {
      type?: 'button' | 'submit' | 'reset'
      disabled?: boolean | Signal<boolean>
      name?: string
      value?: string
    }

    interface HtmlSelect extends WfuiAttributes<HTMLSelectElement> {
      value?: string | Signal<string>
      disabled?: boolean
      name?: string
      required?: boolean
      multiple?: boolean
    }

    interface HtmlOption extends WfuiAttributes<HTMLOptionElement> {
      value?: string
      selected?: boolean
      disabled?: boolean
      label?: string
    }

    interface HtmlTextarea extends WfuiAttributes<HTMLTextAreaElement> {
      value?: string | Signal<string>
      placeholder?: string
      disabled?: boolean
      readonly?: boolean
      required?: boolean
      rows?: number
      cols?: number
      autofocus?: boolean
      name?: string
    }

    interface HtmlLabel extends WfuiAttributes<HTMLLabelElement> {
      htmlFor?: string
    }

    interface HtmlFieldset extends WfuiAttributes<HTMLFieldSetElement> {
      disabled?: boolean
      name?: string
    }
    type HtmlLegend = WfuiAttributes<HTMLLegendElement>

    interface HtmlA extends WfuiAttributes<HTMLAnchorElement> {
      href?: string
      target?: string
      rel?: string
      download?: string
    }

    interface HtmlImg extends WfuiAttributes<HTMLImageElement> {
      src?: string | Signal<string>
      alt?: string
      width?: number | string
      height?: number | string
      loading?: 'lazy' | 'eager'
      srcset?: string
      sizes?: string
    }

    interface HtmlVideo extends WfuiAttributes<HTMLVideoElement> {
      src?: string
      controls?: boolean
      autoplay?: boolean
      loop?: boolean
      muted?: boolean
      poster?: string
      width?: number | string
      height?: number | string
    }

    interface HtmlAudio extends WfuiAttributes<HTMLAudioElement> {
      src?: string
      controls?: boolean
      autoplay?: boolean
      loop?: boolean
      muted?: boolean
    }

    type HtmlCanvas = WfuiAttributes<HTMLCanvasElement> & {
      width?: number
      height?: number
    }

    type HtmlSvg = WfuiAttributes<SVGSVGElement> & {
      viewBox?: string
      xmlns?: string
      fill?: string
      width?: string | number
      height?: string | number
    }

    interface HtmlLink extends WfuiAttributes<HTMLLinkElement> {
      rel?: string
      href?: string
      type?: string
      media?: string
    }

    interface HtmlStyle extends WfuiAttributes<HTMLStyleElement> {
      scoped?: boolean
      media?: string
    }

    interface HtmlScript extends WfuiAttributes<HTMLScriptElement> {
      src?: string
      type?: string
      async?: boolean
      defer?: boolean
    }

    type HtmlStrong = WfuiAttributes<HTMLElement>
    type HtmlEm = WfuiAttributes<HTMLElement>
    type HtmlB = WfuiAttributes<HTMLElement>
    type HtmlI = WfuiAttributes<HTMLElement>
    type HtmlU = WfuiAttributes<HTMLElement>
    type HtmlS = WfuiAttributes<HTMLElement>
    type HtmlMark = WfuiAttributes<HTMLElement>
    type HtmlCode = WfuiAttributes<HTMLElement>
    type HtmlSmall = WfuiAttributes<HTMLElement>
    type HtmlSub = WfuiAttributes<HTMLElement>
    type HtmlSup = WfuiAttributes<HTMLElement>
    type HtmlAbbr = WfuiAttributes<HTMLElement>
    type HtmlTime = WfuiAttributes<HTMLElement> & { datetime?: string }
    type HtmlBr = WfuiAttributes<HTMLBRElement>
    type HtmlHr = WfuiAttributes<HTMLHRElement>
    type HtmlWbr = WfuiAttributes<HTMLElement>

    type HtmlTemplate = WfuiAttributes<HTMLTemplateElement>
    type HtmlSlot = WfuiAttributes<HTMLSlotElement>
    type HtmlDetails = WfuiAttributes<HTMLDetailsElement>
    type HtmlSummary = WfuiAttributes<HTMLElement>
    type HtmlDialog = WfuiAttributes<HTMLDialogElement>
    type HtmlIframe = WfuiAttributes<HTMLIFrameElement> & { src?: string; name?: string; width?: string; height?: string }
  }
}

// ── ctx 上下文（渲染时注入）──────────────────────────────────

let currentCtx: WfuiContext | null = null

export function setCtx(ctx: WfuiContext | null) {
  currentCtx = ctx
}

export function getCtx(): WfuiContext | null {
  return currentCtx
}

// ── 生命周期 ─────────────────────────────────────────────────

/**
 * onMount — 组件挂载到 DOM 后执行的回调。
 *
 * 在组件函数中调用，注册一个函数，当组件的根元素进入文档时执行。
 * 返回函数在组件卸载时自动清理。
 *
 * ```tsx
 * function Chart() {
 *   onMount(() => {
 *     const chart = echarts.init(document.getElementById('chart')!)
 *     return () => chart.dispose()
 *   })
 *   return <div id="chart" style="width:100%;height:400px" />
 * }
 * ```
 */
export function onMount(fn: () => (() => void) | void): void {
  if (_pendingMountQueue) _pendingMountQueue.push(fn)
}

/**
 * onCleanup — 组件卸载时执行的回调。
 *
 * ```tsx
 * function Timer() {
 *   const id = setInterval(() => console.log('tick'), 1000)
 *   onCleanup(() => clearInterval(id))
 *   return <div>Timer running</div>
 * }
 * ```
 */
export function onCleanup(fn: () => void): void {
  if (_pendingCleanupQueue) _pendingCleanupQueue.push(fn)
}

// ── 类型 ────────────────────────────────────────────────────

export type Component<P = {}> = (props: P, ctx: WfuiContext) => Node

// ── 工具 ─────────────────────────────────────────────────────

/** 当前组件渲染中积攒的 onMount 回调 */
let _pendingMountQueue: (() => (() => void) | void)[] | null = null
/** 当前组件渲染中积攒的 onCleanup 回调 */
let _pendingCleanupQueue: (() => void)[] | null = null

interface _Entry {
  mounted: boolean
  observer: MutationObserver | null
  mountFns: (() => (() => void) | void)[]
  disposeFns: (() => void)[]
}

const _entries = new Map<Element, _Entry>()

function _ensure(el: Element): _Entry {
  let entry = _entries.get(el)
  if (entry) return entry

  entry = {
    mounted: document.contains(el),
    observer: null,
    mountFns: [],
    disposeFns: [],
  }
  _entries.set(el, entry)

  const obs = new MutationObserver(() => {
    const now = document.contains(el)
    if (now && !entry!.mounted) {
      // 元素进入文档 → 执行所有挂起和新增的 mount 回调
      entry!.mounted = true
      const fns = entry!.mountFns.slice()
      entry!.mountFns = []
      for (const fn of fns) {
        const dispose = fn()
        if (typeof dispose === 'function') {
          entry!.disposeFns.push(dispose)
        }
      }
    } else if (!now && entry!.mounted) {
      // 元素离开文档 → 执行所有清理函数
      entry!.mounted = false
      for (const fn of entry!.disposeFns) fn()
      entry!.disposeFns = []
      entry!.mountFns = []
      obs.disconnect()
      _entries.delete(el)
    }
  })
  obs.observe(document.body, { childList: true, subtree: true })
  entry.observer = obs

  return entry
}

/** @internal 元素进入文档时执行回调，返回函数在元素离开时自动清理 */
function _onMountElement(el: Element, fn: () => (() => void) | void): void {
  const entry = _ensure(el)
  if (entry.mounted) {
    const dispose = fn()
    if (typeof dispose === 'function') {
      entry.disposeFns.push(dispose)
    }
  } else {
    entry.mountFns.push(fn)
  }
}

/**
 * 包装第三方库为组件 — 元素挂载后执行 setup，返回函数在元素移除时自动清理。
 *
 * 自动创建容器元素 + 自动管理生命周期。
 * 返回标准的 (props, ctx) => Node 组件。
 *
 * ```tsx
 * const PieChart = wrap('div', (el, props: { data: any }, ctx) => {
 *   el.style.cssText = 'width:100%;height:300px'
 *   const chart = echarts.init(el)
 *   chart.setOption(props.data)
 *   effect(() => chart.setOption(props.data))
 *   return () => chart.dispose()
 * })
 *
 * const CanvasChart = wrap('canvas', (el, props, ctx) => {
 *   const chart = new Chart(el, { type: 'line', data: props.data })
 *   return () => chart.destroy()
 * })
 *
 * // 在 JSX 中使用
 * function Dashboard() {
 *   return <div><PieChart data={salesData} /><CanvasChart data={trendData} /></div>
 * }
 * ```
 */
export function wrap<P = {}>(
  tagName: string,
  setup: (el: HTMLElement, props: P, ctx: WfuiContext) => (() => void) | void,
): Component<P> {
  return (props: P, ctx: WfuiContext): Node => {
    const el = document.createElement(tagName)
    _onMountElement(el, () => setup(el, props, ctx))
    return el
  }
}

/** @internal 将 effect dispose 注册到元素生命周期。
 * 元素离开 DOM 时自动调用 dispose，无论元素当前是否挂载。
 */
function _trackEffect(el: Element, dispose: () => void) {
  const entry = _ensure(el)
  entry.disposeFns.push(dispose)
}

function setProp(el: Element, key: string, value: unknown) {
  if (key === 'class' || key === 'className') {
    if (isSignal(value)) {
      _trackEffect(el, effect(() => { el.className = String(value.value) }))
    } else {
      el.className = String(value ?? '')
    }
  } else if (key === 'style' && typeof value === 'object' && value !== null) {
    Object.assign((el as HTMLElement).style, value)
  } else if (key.startsWith('on') && typeof value === 'function') {
    el.addEventListener(key.slice(2).toLowerCase(), value as EventListener)
  } else if (key === 'ref' && typeof value === 'function') {
    value(el)
  } else if (isSignal(value)) {
    _trackEffect(el, effect(() => {
      const v = value.value
      if (v == null || v === false) el.removeAttribute(key)
      else if (v === true) el.setAttribute(key, '')
      else el.setAttribute(key, String(v))
    }))
  } else if (value != null && value !== false) {
    if (value === true) el.setAttribute(key, '')
    else el.setAttribute(key, String(value))
  }
}

function appendChild(parent: Node, child: unknown) {
  if (child == null || child === false || child === true) return
  if (Array.isArray(child)) { child.forEach(c => appendChild(parent, c)); return }
  if (child instanceof Node) { parent.appendChild(child); return }
  if (isSignal(child)) {
    const text = document.createTextNode('')
    if (parent instanceof Element) {
      _trackEffect(parent, effect(() => { text.textContent = String(child.value) }))
    } else {
      effect(() => { text.textContent = String(child.value) })
    }
    parent.appendChild(text)
    return
  }
  parent.appendChild(document.createTextNode(String(child)))
}

// ── JSX 工厂 ─────────────────────────────────────────────────

export function jsx(
  type: string | Component,
  props: Record<string, unknown> | null,
  ...children: unknown[]
): Node {
  if (typeof type === 'function') {
    const merged = children.length > 0 ? { ...props, children } : props

    // ── 组件生命周期管理 ──
    // 每层组件调用维护独立的 mount/cleanup 队列
    const prevMount = _pendingMountQueue
    const prevCleanup = _pendingCleanupQueue
    _pendingMountQueue = []
    _pendingCleanupQueue = []

    let result: Node = document.createDocumentFragment()
    try {
      result = (type as any)(merged, currentCtx) ?? document.createDocumentFragment()
    } finally {
      // 将本层组件的生命周期回调关联到返回的根元素
      if (_pendingMountQueue.length > 0 || _pendingCleanupQueue.length > 0) {
        let targetEl: Element | null = null
        if (result instanceof Element) {
          targetEl = result
        } else if (result instanceof DocumentFragment && result.firstElementChild) {
          targetEl = result.firstElementChild
        }

        if (targetEl) {
          const entry = _ensure(targetEl)
          for (const fn of _pendingMountQueue) {
            if (entry.mounted) {
              const dispose = fn()
              if (typeof dispose === 'function') entry.disposeFns.push(dispose)
            } else {
              entry.mountFns.push(fn)
            }
          }
          for (const fn of _pendingCleanupQueue) {
            entry.disposeFns.push(fn)
          }
        }
      }

      // 恢复上层组件的队列
      _pendingMountQueue = prevMount
      _pendingCleanupQueue = prevCleanup
    }

    return result
  }

  const el = document.createElement(type)
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (k !== 'children') setProp(el, k, v)
    }
  }
  // children 可能在 rest 参数里（手动调用），也可能在 props.children 里（jsx:automatic）
  const childList = children.length > 0 ? children : (props?.children != null ? [props.children] : [])
  for (const child of childList) appendChild(el, child)
  return el
}

export function jsxs(
  type: string | Component,
  props: Record<string, unknown> | null,
  ...children: unknown[]
): Node {
  return jsx(type, props, ...children)
}

export function jsxDEV(
  type: string | Component,
  props: Record<string, unknown> | null,
  _key: string | null,
  _isStatic: boolean,
  _source: { fileName: string; lineNumber: number },
  _self: unknown,
): Node {
  return jsx(type, props, ...(props?.children ? [props.children] : []))
}

export function Fragment(props: Record<string, unknown> | null, ...children: unknown[]): Node {
  const frag = document.createDocumentFragment()
  for (const child of children) appendChild(frag, child)
  return frag
}

// ── 挂载 ─────────────────────────────────────────────────────

/**
 * 直接挂载 DOM（低层 API，一般用 createApp().mount()）
 */
export function domMount(root: string | Element, app: Node): void {
  const container = typeof root === 'string' ? document.querySelector(root) : root
  if (!container) throw new Error(`mount target not found: ${root}`)
  container.innerHTML = ''
  container.appendChild(app)
}

// ── 控制流组件 ──────────────────────────────────────────────

/**
 * ErrorBoundary — 捕获子组件渲染时的异常。
 *
 * children 必须是 thunk（函数），延迟执行以便捕获错误。
 *
 * ```tsx
 * // 基本用法
 * <ErrorBoundary fallback={(e) => <p>出错了: {e.message}</p>}>
 *   {() => <Dashboard />}
 * </ErrorBoundary>
 *
 * // 带错误日志回调
 * <ErrorBoundary
 *   fallback={(e) => <ErrorPage error={e} />}
 *   onError={(e, info) => console.error(e, info)}
 * >
 *   {() => <Dashboard />}
 * </ErrorBoundary>
 * ```
 */
export function ErrorBoundary({ fallback, children, onError }: {
  fallback: (error: Error) => Node
  children: () => Node
  /** 错误发生时回调（用于日志上报） */
  onError?: (error: Error) => void
}, _ctx: WfuiContext): Node {
  try {
    return children()
  } catch (e) {
    const err = e as Error
    if (onError) onError(err)
    return fallback(err)
  }
}

/**
 * Portal — 将组件渲染到父容器之外的 DOM 位置。
 *
 * 适用于 Modal、Dropdown、Tooltip 等需要突破 overflow / z-index 的场景。
 *
 * ```tsx
 * import { createPortal } from 'weifuwu/client'
 *
 * function Modal({ show, children }) {
 *   return <Show when={show}>
 *     {createPortal(
 *       <div class="fixed inset-0 bg-black/50 flex items-center justify-center">
 *         {children}
 *       </div>,
 *       document.body
 *     )}
 *   </Show>
 * }
 * ```
 */
export function createPortal(node: Node, target: Element): Node {
  target.appendChild(node)
  // 返回空 fragment 占位，实际节点挂在 target 下
  return document.createDocumentFragment()
}

function toNode(v: unknown): Node {
  if (v instanceof Node) return v
  if (typeof v === 'function') return toNode(v())
  return document.createTextNode(String(v ?? ''))
}

/**
 * 条件渲染 — when 为 Signal 时响应式切换
 *
 * ```tsx
 * <Show when={isLoggedIn} fallback={<LoginPage />}>
 *   <ChatPage />
 * </Show>
 * ```
 */
export function Show({ when, children, fallback }: {
  when: boolean | Signal<boolean>
  children?: Node | (() => Node)
  fallback?: Node | (() => Node)
}): Node {
  // 用 display: contents 避免多余包装盒，同时保有持久 DOM 锚点
  const el = document.createElement('div')
  el.style.display = 'contents'

  function render(show: boolean) {
    // 清空所有子节点，同时触发旧子节点的 MutationObserver 清理
    while (el.lastChild) el.removeChild(el.lastChild)
    if (show && children != null) {
      el.appendChild(toNode(children))
    } else if (!show && fallback != null) {
      el.appendChild(toNode(fallback))
    }
  }

  if (isSignal(when)) {
    const dispose = effect(() => render(Boolean(when.value)))
    // Show 自身的 effect 绑定到 el 生命周期
    _trackEffect(el, dispose)
  } else {
    render(Boolean(when))
  }
  return el
}

/**
 * 列表渲染 — each 为 Signal 时响应式更新
 *
 * 支持 keyBy 属性实现 keyed 渲染：已有 key 的节点复用，新增/删除节点最小化 DOM 操作。
 *
 * ```tsx
 * <For each={items} keyBy="id">
 *   {(item) => <div>{item.name}</div>}
 * </For>
 * ```
 */
export function For<T>({ each, children, keyBy }: {
  each: T[] | Signal<T[]>
  children: (item: T, index: number) => Node
  /**
   * key 提取方式：字段名（如 'id'）或 (item) => string 函数。
   * 省略时退化为全量重建（原行为）。
   */
  keyBy?: keyof T | ((item: T) => string)
}): Node {
  // 用 display: contents 避免多余包装盒，同时保有持久 DOM 锚点
  const el = document.createElement('div')
  el.style.display = 'contents'

  function getKey(item: T, index: number): string {
    if (typeof keyBy === 'function') return keyBy(item)
    if (typeof keyBy === 'string') return String(item[keyBy] ?? index)
    return String(index)
  }

  function render(list: T[]) {
    if (!keyBy) {
      // 无 key：全量重建（原行为）
      while (el.lastChild) el.removeChild(el.lastChild)
      for (let i = 0; i < list.length; i++) {
        el.appendChild(children(list[i], i))
      }
      return
    }

    // Keyed 渲染：复用已有 DOM 节点
    const oldNodes = Array.from(el.children).filter((n): n is Element => n instanceof Element)
    const oldKeyMap = new Map<string, Element>()
    for (const node of oldNodes) {
      const k = node.getAttribute('data-key')
      if (k !== null) oldKeyMap.set(k, node)
    }

    // 构建新 key 列表
    const newKeys: string[] = []
    const newItems: T[] = []
    for (let i = 0; i < list.length; i++) {
      newKeys.push(getKey(list[i], i))
      newItems.push(list[i])
    }

    // 收集需要移除的 key（旧有但新没有）
    const removedKeys = new Set(oldKeyMap.keys())
    for (const k of newKeys) removedKeys.delete(k)

    // 移除消失的节点（触发 MutationObserver 清理 effect）
    for (const k of removedKeys) {
      const node = oldKeyMap.get(k)!
      node.remove()
      oldKeyMap.delete(k)
    }

    // 按正确顺序排列节点
    let insertBefore: Node | null = el.firstChild
    for (let i = list.length - 1; i >= 0; i--) {
      const key = newKeys[i]
      const existing = oldKeyMap.get(key)
      if (existing) {
        // 已存在：移动到正确位置
        el.insertBefore(existing, insertBefore)
        insertBefore = existing
      } else {
        // 新节点：创建并插入
        const node = children(newItems[i], i)
        if (node instanceof Element) {
          node.setAttribute('data-key', key)
        }
        el.insertBefore(node, insertBefore)
        insertBefore = node
      }
    }
  }

  if (isSignal(each)) {
    const dispose = effect(() => render(each.value))
    _trackEffect(el, dispose)
  } else {
    render(each)
  }
  return el
}
