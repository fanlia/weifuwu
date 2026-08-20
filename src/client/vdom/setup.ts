/**
 * vdom 测试环境 — testBrowser()（浏览器环境注入——零全局污染）
 *
 * 设计（2026-12）：uiServe(router, { root, browser })——环境即依赖注入——
 * 测试不再需要 before(setupJsdom)——每个测试独立 jsdom 实例（隔离更干净）。
 *
 * **Proxy 全调用追踪（AGENTS §7.1.4 红线——client 测试必须基于 testBrowser）**：
 * window/document 及返回的 DOM 节点全部包装 Proxy——**每次操作记录**到
 * `browser.trace.entries`：
 * - `call`（方法调用——createElement/querySelector/addEventListener/appendChild…）
 *   **全记录保证**——含参数/返回值摘要
 * - `set`（属性赋值——innerHTML/location.hash…）**全记录保证**
 * - `get` 只记 window/document 顶层属性（window.location/document.body…）——
 *   元素深层属性读（tagName/textContent/childNodes…）不记录（噪音 90%+——
 *   内存/预算防护——filter 后可查）
 * - `WF_JS_TRACE=1` 或 `testBrowser({ log: true })` 每次调用打印；
 *   `testBrowser({ filter })` 精确到路径子串
 *
 * **身份保持（硬性）**：WeakMap 缓存——同一 target 恒同一 proxy——
 * `===` 断言/assertKept（同 key 复用项 DOM 引用不变）不破；
 * instanceof/nodeType 语义不破（原型链保持）；方法 this 绑定 raw target
 * （jsdom 内部槽位语义保持）。
 *
 * ```ts
 * import { testBrowser } from './setup.ts'
 * const browser = testBrowser()
 * const serve = uiServe(router, { root: '#root', browser })
 * assert.equal(browser.document.querySelector('#root .app')?.textContent, 'hello world')
 * // 失败诊断：browser.trace.print() / trace.filter('addEventListener')
 * ```
 */

import { JSDOM } from 'jsdom'
import type { Browser } from './browser/Browser.ts'

// ═══════════════════════════════════════════════════════════════
// Trace（window/document 全操作追踪）
// ═══════════════════════════════════════════════════════════════

export interface TraceEntry {
  /** 序号（时间序） */
  seq: number
  /** 路径（'document.createElement' / 'window.addEventListener' / 'document.body.appendChild'） */
  path: string
  /** 操作类型 */
  kind: 'call' | 'get' | 'set'
  /** 参数摘要（'div' / '[Element div]' / 'fn'——不展开大对象） */
  args?: string
  /** 返回值摘要 */
  ret?: string
}

export interface TraceLog {
  /** 全部记录（时间序） */
  entries: TraceEntry[]
  /** 按路径子串过滤（测试断言用） */
  filter(sub: string | RegExp): TraceEntry[]
  /** 次数统计（如 addEventListener 泄漏检测） */
  count(sub: string | RegExp): number
  /** 清空（每用例间） */
  clear(): void
  /** 按时间序打印（失败诊断 dump） */
  print(entries?: TraceEntry[]): void
}

export interface TraceOptions {
  /** 记录开关（默认 true） */
  record?: boolean
  /** 每次调用 console 打印（默认 false——env WF_JS_TRACE=1 全局开） */
  log?: boolean
  /** 只记录/打印匹配 path 子串的调用 */
  filter?: string | RegExp
}

/** 值摘要（fn → 'fn'、元素 → '[Element div]'、字符串 → JSON——不展开大对象） */
function summarize(v: unknown): string {
  if (v === null) return 'null'
  if (v === undefined) return 'undefined'
  const t = typeof v
  if (t === 'string') return JSON.stringify(v)
  if (t === 'number' || t === 'boolean') return String(v)
  if (t === 'function') return 'fn'
  if (t === 'symbol') return v.toString()
  if (t === 'object') {
    const nodeType = (v as { nodeType?: unknown }).nodeType
    if (typeof nodeType === 'number') {
      const nodeName = (v as { nodeName?: unknown }).nodeName
      return `[${typeof nodeName === 'string' && nodeName ? nodeName : `nodeType ${nodeType}`}]`
    }
    if (Array.isArray(v)) {
      const head = v.slice(0, 3).map(summarize).join(', ')
      return `[${head}${v.length > 3 ? ', …' : ''}]`
    }
    const ctor = (v as { constructor?: { name?: string } }).constructor
    return `[${typeof ctor?.name === 'string' ? ctor.name : 'Object'}]`
  }
  return String(v)
}

/** 环境变量开关（进程级一次读取——WF_JS_TRACE=1 全打印 / WF_JS_TRACE=scrollTo 过滤打印） */
const envTrace = (() => {
  const v = typeof process !== 'undefined' ? process.env.WF_JS_TRACE : undefined
  if (!v) return null
  return v === '1' ? { log: true } : { log: true, filter: v }
})()

const PUSH = Symbol('tracePush')

function createTrace(opts: TraceOptions = {}): TraceLog {
  const record = opts.record ?? true
  const log = opts.log ?? envTrace?.log ?? false
  const filter = opts.filter ?? envTrace?.filter
  const match = (path: string): boolean => {
    if (!filter) return true
    return typeof filter === 'string' ? path.includes(filter) : filter.test(path)
  }
  const entries: TraceEntry[] = []
  const trace: TraceLog = {
    entries,
    filter(sub) {
      return entries.filter((e) => (typeof sub === 'string' ? e.path.includes(sub) : sub.test(e.path)))
    },
    count(sub) {
      return trace.filter(sub).length
    },
    clear() {
      entries.length = 0
    },
    print(list = entries) {
      for (const e of list) {
        const args = e.args !== undefined ? `(${e.args})` : ''
        const ret = e.ret !== undefined ? ` → ${e.ret}` : ''
        console.log(`[jsdom] ${e.seq} ${e.path}${args}${ret}`)
      }
    },
  }
  ;(trace as TraceLog & { [PUSH]?: (e: Omit<TraceEntry, 'seq'>) => void })[PUSH] = (e) => {
    const entry = { seq: entries.length, ...e }
    if (record) entries.push(entry)
    if (log && e.kind !== 'get' && match(e.path)) {
      const args = e.args !== undefined ? (e.kind === 'set' ? ` = ${e.args}` : `(${e.args})`) : ''
      const ret = e.ret !== undefined ? ` → ${e.ret}` : ''
      console.log(`[jsdom] ${e.path}${args}${ret}`)
    }
  }
  return trace
}

/** 调用参数摘要（逐参 summarize 逗号连接——'div, fn'——非数组形态） */
function summarizeArgs(args: unknown[]): string {
  return args.map(summarize).join(', ')
}

/** 推送 trace 条目（wrap 层唯一入口——record + log 双通道） */
function tracePush(trace: TraceLog, e: Omit<TraceEntry, 'seq'>): void {
  ;(trace as TraceLog & { [PUSH]?: (e: Omit<TraceEntry, 'seq'>) => void })[PUSH]?.(e)
}

// ═══════════════════════════════════════════════════════════════
// Proxy 包装（window/document/节点/方法——身份保持 + 全操作追踪）
// ═══════════════════════════════════════════════════════════════

/** 代理缓存（同一 target 恒同一 proxy——`===` 身份不破——assertKept 依赖） */
const proxyCache = new WeakMap<object, object>()

/** 已包装集合（防双重包装——委托 currentTarget 可能已是 proxy——
 *  缓存按 raw key——proxy 不在缓存——再包一层会身份断裂（真实事故）） */
const wrappedSet = new WeakSet<object>()

/** proxy → raw 反向映射（方法调用参数解包——jsdom 内部槽位需要 raw 节点） */
const proxyToRaw = new WeakMap<object, object>()

/** 事件包装缓存（同一事件对象恒同一 proxy——多 handler 共享一致） */
const eventCache = new WeakMap<object, object>()

/** 监听器包装缓存（用户 fn → 包装后监听器——removeEventListener 身份匹配） */
const listenerCache = new WeakMap<object, object>()

function isNodeLike(v: unknown): v is object {
  return typeof v === 'object' && v !== null && typeof (v as { nodeType?: unknown }).nodeType === 'number'
}

/** 已包装判定（防双重包装——wrapDom/wrapEvent/wrapCollection 共用） */
function alreadyWrapped(v: object): boolean {
  return wrappedSet.has(v)
}

/** 参数解包（wrapped → raw——jsdom 内部槽位（_impl）需要 raw 节点——
 *  Range.setEndAfter(proxy) 静默失效真实事故——方法调用参数统一解包） */
function unwrapArg(v: unknown): unknown {
  if (v !== null && typeof v === 'object' && alreadyWrapped(v)) {
    return proxyToRaw.get(v) ?? v
  }
  return v
}

/** 泛化包装判定（非纯对象/数组——Range/Selection/Style/DOMRect 等——
 *  方法经 fn proxy（参数解包）——纯对象/数组不包（Array.isArray 语义/数据）） */
function shouldWrapObj(v: object): boolean {
  if (Array.isArray(v)) return false
  const proto = Object.getPrototypeOf(v)
  return proto !== null && proto !== Object.prototype
}

/**
 * 包装事件对象（监听器边界——委托分发 e.target/currentTarget 是 raw 节点——
 * 组件经 document.activeElement/querySelector 拿到 proxy——同一节点两种身份
 * 会失配（Tabs 键盘导航真实事故）——事件属性统一经身份缓存包装）
 */
function wrapEvent(e: Event, trace: TraceLog): Event {
  if (alreadyWrapped(e)) return e
  const cached = eventCache.get(e)
  if (cached) return cached as Event
  const p = new Proxy(e, {
    get(t, k, r) {
      if (typeof k === 'symbol') return Reflect.get(t, k, t)
      const v = Reflect.get(t, k, t)
      if ((k === 'target' || k === 'currentTarget' || k === 'relatedTarget' || k === 'srcElement') && isNodeLike(v) && !alreadyWrapped(v)) {
        return wrapDom(v, 'event', trace)
      }
      return v
    },
  })
  wrappedSet.add(p)
  eventCache.set(e, p)
  proxyToRaw.set(p, e)
  return p
}

/** 包装监听器（事件经 wrapEvent 交付——缓存保 removeEventListener 身份） */
function wrapListener(fn: unknown, trace: TraceLog): unknown {
  if (typeof fn !== 'function') return fn
  const cached = listenerCache.get(fn as object)
  if (cached) return cached
  const wrapped = (e: Event): void => {
    Reflect.apply(fn as (...a: unknown[]) => unknown, null, [wrapEvent(e, trace)])
  }
  listenerCache.set(fn as object, wrapped)
  return wrapped
}

/** 集合判定（NodeList/HTMLCollection——item() 方法鉴别——身份统一包装） */
function isCollection(v: unknown): v is object {
  return typeof v === 'object' && v !== null
    && typeof (v as { item?: unknown }).item === 'function'
    && typeof (v as { length?: unknown }).length === 'number'
}

/**
 * 包装 DOM 集合（NodeList/HTMLCollection——querySelectorAll/childNodes/children）
 * - 下标访问/遍历/item() → 元素按身份缓存包装（与 querySelector/遍历链同 proxy）
 * - Symbol.iterator 产出包装后的元素（Array.from/for-of 身份一致）
 */
function wrapCollection(col: object, path: string, trace: TraceLog): any {
  if (alreadyWrapped(col)) return col
  const cached = proxyCache.get(col)
  if (cached) return cached
  const wrapItem = (raw: unknown): unknown =>
    isNodeLike(raw) ? wrapDom(raw, path, trace) : raw
  const p = new Proxy(col, {
    get(t, k, r) {
      if (typeof k === 'symbol') {
        if (k === Symbol.iterator) {
          return function* () {
            const len = (t as { length: number }).length
            for (let i = 0; i < len; i++) yield wrapItem((t as unknown[])[i])
          }
        }
        return Reflect.get(t, k, t)
      }
      const v = Reflect.get(t, k, t)
      if (isNodeLike(v)) return wrapDom(v, `${path}[${k}]`, trace)
      if (typeof v === 'function') return wrapFn(v, t, `${path}.${k}`, trace)
      return v
    },
  })
  proxyCache.set(col, p)
  wrappedSet.add(p)
  proxyToRaw.set(p, col)
  return p
}

/**
 * 包装 DOM 对象（window/document/节点）
 * - get：记录顶层属性读（window.xxx/document.xxx——路径深度 1）——子节点
 *   惰性包装（身份缓存）——方法包装（this 绑定 raw target）
 * - set：记录属性赋值（innerHTML/location.hash…）
 */
function wrapDom(target: object, path: string, trace: TraceLog, depth = 0): any {
  if (alreadyWrapped(target)) return target
  const cached = proxyCache.get(target)
  if (cached) return cached
  const p = new Proxy(target, {
    get(t, k, r) {
      if (typeof k === 'symbol') return Reflect.get(t, k, t)
      const v = Reflect.get(t, k, t)
      if (depth === 0) {
        tracePush(trace, { path: `${path}.${k}`, kind: 'get', ret: summarize(v) })
      }
      if (isNodeLike(v)) return wrapDom(v, `${path}.${k}`, trace, depth + 1)
      if (isCollection(v)) return wrapCollection(v, `${path}.${k}`, trace)
      if (typeof v === 'function') return wrapFn(v, t, `${path}.${k}`, trace)
      if (typeof v === 'object' && v !== null && shouldWrapObj(v)) {
        return wrapDom(v, `${path}.${k}`, trace, depth + 1)
      }
      return v
    },
    set(t, k, v, r) {
      if (typeof k === 'symbol') return Reflect.set(t, k, v, t)
      tracePush(trace, { path: `${path}.${k}`, kind: 'set', args: summarize(v) })
      return Reflect.set(t, k, v, t)
    },
  })
  proxyCache.set(target, p)
  wrappedSet.add(p)
  proxyToRaw.set(p, target)
  return p
}

/** 包装方法（this 绑定 raw target——内部槽位语义保持；返回节点再包装——
 *  每次 get 新建（函数身份不作为注册键——监听器身份是用户 fn 本身）） */
function wrapFn(fn: (...a: unknown[]) => unknown, thisTarget: object, path: string, trace: TraceLog): any {
  return new Proxy(fn, {
    apply(t, _this, args) {
      // 监听器边界：addEventListener/removeEventListener 的事件参数包装
      // （委托分发 target 是 raw——身份统一到 proxy 面）
      const wrappedArgs = (path.endsWith('.addEventListener') || path.endsWith('.removeEventListener'))
        ? args.map((a, i) => (i === 1 ? wrapListener(a, trace) : a))
        : args
      const rawArgs = wrappedArgs.map(unwrapArg)
      const ret = Reflect.apply(t, thisTarget, rawArgs)
      tracePush(trace, { path, kind: 'call', args: summarizeArgs(args), ret: summarize(ret) })
      if (isNodeLike(ret)) return wrapDom(ret, path, trace)
      if (isCollection(ret)) return wrapCollection(ret, path, trace)
      if (typeof ret === 'object' && ret !== null && shouldWrapObj(ret)) return wrapDom(ret, path, trace)
      return ret
    },
  })
}

// ═══════════════════════════════════════════════════════════════
// testBrowser
// ═══════════════════════════════════════════════════════════════

export type TestBrowser = Browser & {
  /** 全操作追踪（window/document/节点——call/set 全记录 + 顶层 get） */
  trace: TraceLog
  /** matchMedia 编程驱动（批量设定 matches + 变更事件）——polyfill 面 */
  setMediaQueries(map: Record<string, boolean>): void
  /** IntersectionObserver 手动触发（jsdom 无布局引擎——确定性驱动） */
  fireIO(target: Element, entry: { isIntersecting: boolean }): void
  /** visualViewport 设定（resize/scroll 事件触发） */
  setViewport(v: { height?: number; offsetTop?: number }): void
  /** clipboard 写入缓冲（navigator.clipboard polyfill 落点——断言用） */
  __clipboardWrites: string[]
}

// ═══════════════════════════════════════════════════════════════
// jsdom 缺失能力 Polyfill（一处实现——全部基于 jsdom 原语——
// Event/EventTarget——测试经 testBrowser 驱动面，禁止各测手搓）
// ═══════════════════════════════════════════════════════════════

/** CSS.escape（规范算法——jsdom 无） */
function cssEscape(str: string): string {
  const s = String(str)
  let out = ''
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    const code = s.charCodeAt(i)
    if (code === 0) { out += '\uFFFD'; continue }
    if ((code >= 0x01 && code <= 0x1f) || code === 0x7f) {
      out += `\\${code.toString(16)} `
      continue
    }
    if (i === 0 && code >= 0x30 && code <= 0x39 || (i === 1 && code >= 0x30 && code <= 0x39 && s[0] === '-')) {
      out += `\\${code.toString(16)} `
      continue
    }
    if (i === 0 && c === '-' && s.length === 1) { out += `\\${c}`; continue }
    if (code >= 0x80 || c === '-' || c === '_' || (code >= 0x30 && code <= 0x39) ||
      (code >= 0x41 && code <= 0x5a) || (code >= 0x61 && code <= 0x7a)) {
      out += c
      continue
    }
    out += `\\${c}`
  }
  return out
}

/** 安装 jsdom 缺失能力（在 raw window 上——先安装后包装——polyfill 调用也被追踪） */
/** polyfill 驱动面（testBrowser 附加能力——测试驱动 jsdom 缺失能力） */
interface PolyfillDrivers {
  setMediaQueries: TestBrowser['setMediaQueries']
  fireIO: TestBrowser['fireIO']
  setViewport: TestBrowser['setViewport']
  clipboardWrites: string[]
}

function installJsdomPolyfills(win: Window): PolyfillDrivers {
  const W = win as unknown as Record<string, unknown>
  const ET = (win as unknown as { EventTarget: typeof globalThis.EventTarget }).EventTarget
  const WinEvent = (win as unknown as { Event: typeof globalThis.Event }).Event
  class MediaQueryListPolyfill extends ET {
    media: string
    matches: boolean
    onchange: ((e: Event) => void) | null = null
    constructor(media: string, matches: boolean) {
      super()
      this.media = media
      this.matches = matches
    }
    addEventListener(type: string, cb: EventListenerOrEventListenerObject | null): void {
      super.addEventListener(type, cb)
    }
    removeEventListener(type: string, cb: EventListenerOrEventListenerObject | null): void {
      super.removeEventListener(type, cb)
    }
  }
  const mqls = new Map<string, MediaQueryListPolyfill>()
  const matchMedia = (q: string): MediaQueryListPolyfill => {
    let m = mqls.get(q)
    if (!m) { m = new MediaQueryListPolyfill(q, false); mqls.set(q, m) }
    return m
  }
  W.matchMedia = matchMedia

  // ── scrollTo：真实现（jsdom 桩是 notImplemented 抛错）──
  W.scrollTo = ((x?: number | ScrollToOptions, y?: number): void => {
    const scroller = win.document.scrollingElement ?? win.document.documentElement
    if (typeof x === 'object' && x !== null) {
      scroller.scrollTop = x.top ?? 0
      scroller.scrollLeft = x.left ?? 0
    } else if (typeof x === 'number') {
      scroller.scrollLeft = x
      scroller.scrollTop = y ?? 0
    }
  }) as unknown as Window['scrollTo']

  // ── IntersectionObserver：确定性 fake（observe 登记 + fireIO 手动触发）──
  type IOCb = (entries: Array<{ isIntersecting: boolean; target: Element }>) => void
  const ioRegistry = new Map<Element, Array<{ cb: IOCb; io: { disconnect: () => void } }>>()
  class IntersectionObserverPolyfill {
    private cb: IOCb
    private observed = new Set<Element>()
    constructor(cb: IOCb) { this.cb = cb }
    observe(el: Element): void {
      this.observed.add(el)
      const list = ioRegistry.get(el) ?? []
      list.push({ cb: this.cb, io: this })
      ioRegistry.set(el, list)
    }
    unobserve(el: Element): void { this.observed.delete(el) }
    disconnect(): void {
      for (const el of this.observed) {
        const list = ioRegistry.get(el)
        if (list) ioRegistry.set(el, list.filter((r) => r.io !== this))
      }
      this.observed.clear()
    }
  }
  W.IntersectionObserver = IntersectionObserverPolyfill

  // ── visualViewport：EventTarget + 可编程 height/offsetTop ──
  class VisualViewportPolyfill extends ET {
    height = 768
    offsetTop = 0
    width = 1024
    scale = 1
  }
  const vv = new VisualViewportPolyfill()
  Object.defineProperty(W, 'visualViewport', { value: vv, configurable: true })

  // ── navigator.clipboard：writeText → 断言缓冲 ──
  const clipboardWrites: string[] = []
  try {
    Object.defineProperty(win.navigator, 'clipboard', {
      value: { writeText: async (t: string): Promise<void> => { clipboardWrites.push(t) } },
      configurable: true,
    })
  } catch { /* 只读——跳过 */ }

  // ── CSS.escape ──
  W.CSS = { escape: cssEscape }

  // ── URL.createObjectURL/revokeObjectURL：简单对象 URL 工厂 ──
  const objUrls = new Map<string, Blob>()
  let urlSeq = 0
  const URLCtor = W.URL as unknown as {
    createObjectURL?: (blob: Blob) => string
    revokeObjectURL?: (url: string) => void
  }
  if (URLCtor) {
    URLCtor.createObjectURL = (blob: Blob): string => {
      const url = `blob:jsdom/${++urlSeq}`
      objUrls.set(url, blob)
      return url
    }
    URLCtor.revokeObjectURL = (url: string): void => { objUrls.delete(url) }
  }

  // ── 驱动面 ──
  return {
    setMediaQueries: (map: Record<string, boolean>) => {
      for (const [q, matches] of Object.entries(map)) {
        const m = matchMedia(q)
        if (m.matches !== matches) {
          m.matches = matches
          m.dispatchEvent(new WinEvent('change'))
        }
      }
    },
    fireIO: (target: Element, entry: { isIntersecting: boolean }) => {
      const list = ioRegistry.get(target)
      if (!list) return
      for (const { cb } of [...list]) cb([{ ...entry, target }])
    },
    setViewport: (v: { height?: number; offsetTop?: number }) => {
      if (v.height !== undefined) vv.height = v.height
      if (v.offsetTop !== undefined) vv.offsetTop = v.offsetTop
      vv.dispatchEvent(new WinEvent('resize'))
      vv.dispatchEvent(new WinEvent('scroll'))
    },
    clipboardWrites,
  }
}

/** 测试浏览器实例（独立 JSDOM——不污染 globalThis——测试间天然隔离——
 *  window/document 包 Proxy——每次操作记录到 trace——WF_JS_TRACE=1 打印） */
export function testBrowser(opts: TraceOptions = {}): TestBrowser {
  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="root"></div></body></html>', {
    url: 'http://localhost',
    pretendToBeVisual: true,
  })
  const rawWin = dom.window as unknown as Window
  const rawDoc = rawWin.document
  const drivers = installJsdomPolyfills(rawWin)
  const trace = createTrace(opts)
  const win = wrapDom(rawWin, 'window', trace)
  const doc = wrapDom(rawDoc, 'document', trace)
  const scroller = (): Element | null => doc.scrollingElement ?? doc.documentElement
  const browser = {
    window: win,
    document: doc,
    copyText: () => {},
    downloadFile: () => false,
    activeElement: () => doc.activeElement as HTMLElement | null,
    byId: (id) => doc.getElementById(id),
    query: (sel) => doc.querySelector(sel) as HTMLElement | null,
    queryAll: (sel) => doc.querySelectorAll(sel),
    createElement: (tag) => doc.createElement(tag),
    createElementNS: (ns, tag) => doc.createElementNS(ns, tag),
    createDocumentFragment: () => doc.createDocumentFragment(),
    createComment: (text) => doc.createComment(text),
    createTextNode: (text) => doc.createTextNode(text),
    addEventListener: (type, fn, options) => win.addEventListener(type, fn, options),
    removeEventListener: (type, fn, options) => win.removeEventListener(type, fn, options),
    scrollTo: (y) => win.scrollTo(0, y),
    scrollTop: () => scroller()?.scrollTop ?? 0,
    matchMedia: (q) => (typeof win.matchMedia === 'function' ? win.matchMedia(q) : null),
    visualViewport: () => (win as unknown as { visualViewport?: VisualViewport }).visualViewport ?? null,
    scrollingElement: () => scroller(),
    bodyElement: () => doc.body,
    bodyAppend: (el) => doc.body.appendChild(el),
    bodyRemove: (el) => doc.body.removeChild(el),
    clearBody: () => { doc.body.innerHTML = '' },
    event: (type, init) => new (win as unknown as { Event: typeof Event }).Event(type, init),
    rootElement: () => doc.documentElement,
    getSelection: () => win.getSelection(),
    selectionText: () => win.getSelection()?.toString() ?? '',
    storageGet: (key) => { try { return win.localStorage.getItem(key) } catch { return null } },
    storageSet: (key, value) => { try { win.localStorage.setItem(key, value) } catch { /* 忽略 */ } },
    timeout: (fn, ms) => win.setTimeout(fn, ms),
    pathname: () => win.location.pathname,
    setHash: (hash) => { win.location.hash = hash },
    viewportHeight: () => win.innerHeight,
    onFormRestore: (fn) => { fn() },
  } as unknown as TestBrowser
  browser.trace = trace
  browser.setMediaQueries = drivers.setMediaQueries
  browser.fireIO = drivers.fireIO
  browser.setViewport = drivers.setViewport
  browser.__clipboardWrites = drivers.clipboardWrites
  return browser
}

// ═══════════════════════════════════════════════════════════════
// 全局安装/恢复（DOM 级测试过渡模式——before/after 成对——
// 来自独立实例——隔离保留——断言优先走 browser.document）
// ═══════════════════════════════════════════════════════════════

interface GlobalRecord { key: string; existed: boolean; prev: unknown }
let installedGlobals: GlobalRecord[] | null = null

/** 把 testBrowser 的 window/document 等安装到 globalThis（测试主体零改动——
 *  恢复原全局——测试间零残留）。返回还原函数。 */
export function installJsdomGlobals(browser: TestBrowser): () => void {
  if (installedGlobals) return () => {}
  const win = browser.window as unknown as Record<string, unknown>
  const g = globalThis as Record<string, unknown>
  const builtins = new Set([
    'Object', 'Array', 'Function', 'String', 'Number', 'Boolean',
    'Symbol', 'Map', 'Set', 'RegExp', 'Promise', 'Error',
    'Date', 'Math', 'JSON', 'parseInt', 'parseFloat', 'isNaN', 'isFinite',
    'undefined', 'NaN', 'Infinity', 'BigInt', 'WeakMap', 'WeakSet', 'Proxy', 'Reflect',
  ])
  const records: GlobalRecord[] = []
  const add = (key: string, value: unknown) => {
    records.push({ key, existed: key in g, prev: g[key] })
    try { g[key] = value } catch { /* 只读全局——跳过 */ }
  }
  for (const key of Object.getOwnPropertyNames(win)) {
    if (builtins.has(key)) continue
    if (key in g) continue
    add(key, win[key])
  }
  add('window', win)
  add('document', browser.document)
  try { add('localStorage', win.localStorage) } catch { /* 无——跳过 */ }
  try { add('sessionStorage', win.sessionStorage) } catch { /* 无——跳过 */ }
  installedGlobals = records
  return () => restoreJsdomGlobals()
}

/** 恢复 globalThis（installJsdomGlobals 的逆操作——after 调用） */
export function restoreJsdomGlobals(): void {
  const records = installedGlobals
  installedGlobals = null
  if (!records) return
  const g = globalThis as Record<string, unknown>
  for (const { key, existed, prev } of records.reverse()) {
    if (existed) g[key] = prev
    else delete g[key]
  }
}

/** 全局 jsdom 初始化（兼容——组件测试迁移期——**已废弃**——AGENTS §7.1.4：
 *  client 测试必须基于 testBrowser——本函数仅迁移过渡使用——迁移完成后删除） */
export function setupJsdom(): void {
  if (typeof document !== 'undefined') return
  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="root"></div></body></html>', {
    url: 'http://localhost', pretendToBeVisual: true,
  })
  const win = dom.window as any
  const g = globalThis as any
  const builtins = new Set([
    'Object', 'Array', 'Function', 'String', 'Number', 'Boolean',
    'Symbol', 'Map', 'Set', 'RegExp', 'Promise', 'Error',
    'Date', 'Math', 'JSON', 'parseInt', 'parseFloat', 'isNaN', 'isFinite',
    'undefined', 'NaN', 'Infinity', 'BigInt', 'WeakMap', 'WeakSet', 'Proxy', 'Reflect',
  ])
  for (const key of Object.getOwnPropertyNames(win)) {
    if (builtins.has(key)) continue
    if (key in g) continue
    try { g[key] = win[key] } catch { /* 只读全局——跳过 */ }
  }
  g.window = win
  g.document = win.document
  // jsdom getter 属性（ownPropertyNames 不含——显式注入——测试 localStorage 依赖）
  try { g.localStorage = win.localStorage } catch { /* 无——跳过 */ }
  try { g.sessionStorage = win.sessionStorage } catch { /* 无——跳过 */ }
}
