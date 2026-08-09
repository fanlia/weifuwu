/**
 * weifuwu/ui-dom UIRouter — 独立实现（不依赖 src/client 任何代码）
 *
 * 定稿架构：
 *   req = window.location，res = VNode，serveUI = VDOM（落地）
 *   handler = 异步组件：async (location, ctx) => vnode（$ 有效）
 *   middleware = 两阶段 async：(location, ctx, children) => async (location, ctx) => vnode
 *   layout 与 SSR 都是中间件
 *
 * $ 路由实例绑定：首次渲染 mount（取数 + $ 创建），$ 赋值 → 重渲染
 * （data 缓存命中 + $ 复用——"外层只使用一次"）
 */

import type { UIHandler, UIMiddleware, UIRouteDef, UIContext, VNode, VNodeChild } from './types.ts'
import { createReactiveState } from './reactive.ts'
import { renderValue, patchValue, rerenderDirtyComponents, hydrateValue } from './render.ts'
import { Registry } from './registry.ts'

/** UIRouter 选项 */
export interface UIRouterOptions {
  mode?: 'hash' | 'history'
}

/** 编译路径：:param → 正则捕获 */
function compilePath(path: string): { re: RegExp; keys: string[] } {
  const keys: string[] = []
  const reStr = path
    .replace(/:(\w+)/g, (_, key) => { keys.push(key); return '([^/]+)' })
    .replace(/\*/g, '.*')
  return { re: new RegExp(`^${reStr}$`), keys }
}

/** 展开路由（含前缀拼接——子路由挂载） */
function flatten(defs: UIRouteDef[], basePath = ''): Array<UIRouteDef & { re: RegExp; keys: string[] }> {
  const result: Array<UIRouteDef & { re: RegExp; keys: string[] }> = []
  for (const def of defs) {
    const full = joinPath(basePath, def.path)
    const { re, keys } = compilePath(full)
    result.push({ ...def, re, keys })
  }
  return result
}

function joinPath(a: string, b: string): string {
  if (!b || b === '/') return a || '/'
  const left = a.endsWith('/') ? a.slice(0, -1) : a
  const right = b.startsWith('/') ? b : '/' + b
  return left + right
}

/**
 * 前端路由应用 — new UIRouter()
 */
export class UIRouter<C extends object = {}> {
  private _routes: UIRouteDef[] = []
  private _middlewares: UIMiddleware[] = []
  private _mode: 'hash' | 'history'
  private _notFound?: UIHandler
  private _rootEl: Element | null = null
  private _oldVNode: VNode | null = null
  /** 当前渲染实例的 ctx（$ 绑定） */
  private _ctx: UIContext | null = null
  /** 当前匹配 handler 的重渲染缓存（避免每次重跑取数） */
  private _currentHandler: UIHandler | null = null
  /** 路由实例的 $（同 URL 共享） */
  private _state: Record<string, any> | null = null
  private _cleanupFns: Array<() => void> = []
  /** hydrate 模式（收养服务端 HTML） */
  private _hydrate = false
  /** O1：微任务已调度（批量合并） */
  private _scheduled = false
  /** O1：组件级微任务已调度 */
  private _compScheduled = false
  /** 渲染保护期（handler 内 $ 赋值丢弃——对齐 client isRendering） */
  private _rendering = false

  constructor(options: UIRouterOptions = {}) {
    this._mode = options.mode ?? 'history'
  }

  /** 中间件（layout/SSR 等） */
  use<I extends object, O extends object>(mw: UIMiddleware<I, O>): UIRouter<C & O>
  /** 子路由挂载（= 后端 mount(path, subRouter)）——独立路由树：sub 的中间件/notFound/嵌套均生效 */
  use(prefix: string, sub: UIRouter): this
  use(arg: UIMiddleware | string, sub?: UIRouter): UIRouter<C> {
    if (typeof arg === 'string' && sub) {
      // 子路由：前缀匹配中间件——URL 在 prefix 下时交给 sub 路由树处理
      const parent = this
      const prefix = arg
      const mw: UIMiddleware = async (_location, ctx, children) => {
        // 当前相对路径（嵌套时 _handle 注入 __routePath；顶层回退 _getPath）
        const path = (ctx as any).__routePath ?? parent._getPath()
        // 段边界匹配：/admin 只匹配 /admin、/admin/...（不匹配 /admin2）
        let rel: string | null = null
        if (path === prefix) rel = '/'
        else if (path.startsWith(prefix + '/')) rel = path.slice(prefix.length)
        if (rel === null) return children // 不在前缀下 → 直通主链
        return async (loc, c) => sub._handle(rel, loc, c) // 交给子路由树
      }
      this._middlewares.push(mw)
      return this
    }
    this._middlewares.push(arg as UIMiddleware)
    return this as unknown as UIRouter<C>
  }

  /**
   * 子路由树处理（供 use(prefix, sub) 调用）：
   * 相对路径匹配 + sub 的中间件链 + sub 的 notFound——支持任意嵌套。
   */
  async _handle(relPath: string, location: Location, ctx: UIContext): Promise<VNode | null> {
    const flat = flatten(this._routes)
    const match = flat.find(f => f.re.test(relPath))
    const params: Record<string, string> = {}
    if (match) {
      const m = relPath.match(match.re)!
      for (let i = 0; i < match.keys.length; i++) params[match.keys[i]] = decodeURIComponent(m[i + 1])
      if (match.title) document.title = match.title
    }
    // 注入共享 ctx（params 是当前渲染请求的解析结果）
    ctx.params = params

    const handler = match ? match.handler : (this._notFound ?? (() => null))
    let inner: UIHandler = handler as UIHandler
    // 注入当前相对路径（嵌套子路由的 mw 用段边界判断）
    const savedRoutePath = (ctx as any).__routePath
    ;(ctx as any).__routePath = relPath
    try {
      for (let i = this._middlewares.length - 1; i >= 0; i--) {
        const mw = this._middlewares[i]
        const child = inner
        inner = (await mw(location, ctx, child)) ?? child
      }
      return (await inner(location, ctx)) as VNode | null
    } finally {
      ;(ctx as any).__routePath = savedRoutePath
    }
  }

  /** 页面路由（对齐后端 get(path, handler)）——handler = 异步组件 */
  get(path: string, handler: UIHandler<C>, opts?: { title?: string }): this {
    this._routes.push({ path, handler: handler as UIHandler, title: opts?.title })
    return this
  }

  /** 404 */
  notFound(handler: UIHandler): this {
    this._notFound = handler
    return this
  }

  /** 释放全部资源 */
  close(): void {
    for (const fn of this._cleanupFns) fn()
    this._cleanupFns = []
    if (this._rootEl) this._rootEl.innerHTML = ''
    this._rootEl = null
    this._oldVNode = null
    this._ctx = null
    this._state = null
  }

  /**
   * 绑定容器 + 监听 URL 变化（serveUI 调用）
   * 返回清理函数
   */
  serve(container: Element, hydrate = false): () => void {
    this._rootEl = container
    this._hydrate = hydrate
    if (!hydrate) container.innerHTML = ''

    // 首次渲染
    this._render()

    // URL 变化监听
    const onPop = () => this._render()
    window.addEventListener('popstate', onPop)
    const onHash = () => this._render()
    if (this._mode === 'hash') window.addEventListener('hashchange', onHash)

    // 编程式导航（注入 ctx.app.navigate）
    if (this._ctx) {
      ;(this._ctx as any).app = {
        navigate: (path: string) => {
          if (this._mode === 'hash') window.location.hash = '#' + path
          else window.history.pushState({}, '', path)
          this._render()
        },
      }
    }

    const cleanup = () => {
      window.removeEventListener('popstate', onPop)
      if (this._mode === 'hash') window.removeEventListener('hashchange', onHash)
    }
    this._cleanupFns.push(cleanup)
    return cleanup
  }

  /** 当前 ctx */
  get ctx(): UIContext {
    return this._ctx ?? ({} as UIContext)
  }

  // ── 渲染管线 ─────────────────────────────────────

  private _getPath(): string {
    if (this._mode === 'hash') return window.location.hash.replace(/^#/, '') || '/'
    return window.location.pathname
  }

  /** 匹配 URL → 执行中间件链 + handler → VNode → 落地 DOM */
  private _render(): void {
    this._scheduleRender()
  }

  /** 调度器（handler 级）：微任务批量合并（O1） */
  private _scheduleRender(): void {
    if (this._scheduled) return
    this._scheduled = true
    queueMicrotask(() => {
      this._scheduled = false
      void this._renderAsync()
    })
  }

  /** 调度器（组件级）：仅重渲染 dirty 组件，不重跑 handler（交互子组件） */
  private _scheduleComponents(): void {
    if (this._compScheduled) return
    this._compScheduled = true
    queueMicrotask(() => {
      this._compScheduled = false
      this._renderComponents()
    })
  }

  /** 组件级重渲染（D1）：仅重渲染 dirty 组件，不重跑 handler/中间件链 */
  private _renderComponents(): void {
    const registry = (this._ctx as any)?.__registry
    if (!registry || !this._rootEl) return
    rerenderDirtyComponents(registry, this._rootEl)
    // 组件重渲染中新 dirty（渲染循环外的赋值）→ 继续（不丢）
    if (registry._dirty.size > 0) this._renderComponents()
  }

  private async _renderAsync(): Promise<void> {
    // 渲染保护期：handler 内 $ 赋值丢弃（对齐 client isRendering）——
    // 避免 $.x = $.x ?? init 首赋触发二次渲染/循环
    if (this._rendering) return
    this._rendering = true
    try {
      await this._renderAsyncInner()
    } catch (err) {
      // O7：handler/中间件抛错 → 错误页兜底（不黑屏）
      console.error('[ui-dom] render error:', err)
      if (this._oldVNode == null && this._rootEl) {
        const errNode = document.createElement('div')
        errNode.className = 'ui-dom-error'
        errNode.textContent = `渲染错误: ${(err as Error)?.message ?? String(err)}`
        this._rootEl.appendChild(errNode)
      }
    } finally {
      this._rendering = false
    }
  }

  private async _renderAsyncInner(): Promise<void> {
    const flat = flatten(this._routes)
    const path = this._getPath()
    const match = flat.find(f => f.re.test(path))
    const params: Record<string, string> = {}
    if (match) {
      const m = path.match(match.re)!
      for (let i = 0; i < match.keys.length; i++) params[match.keys[i]] = decodeURIComponent(m[i + 1])
      if (match.title) document.title = match.title
    }

    // 创建/复用 ctx（$ 绑定当前路由实例）
    const ctx = this._ensureCtx(params)

    // handler = 匹配的 or 404
    const handler = match ? match.handler : (this._notFound ?? (() => null))

    // 执行中间件链（洋葱）：从最外层向内
    let inner: UIHandler = handler as UIHandler
    for (let i = this._middlewares.length - 1; i >= 0; i--) {
      const mw = this._middlewares[i]
      const child = inner
      inner = (await mw(window.location, ctx, child)) ?? child
    }
    // 执行 handler → VNode
    const vnode = (await inner(window.location, ctx)) as VNode | null

    // 落地：首次挂载 / 后续 diff（hydrate 模式收养服务端 HTML）
    if (this._oldVNode == null) {
      if (vnode) {
        const node = this._hydrate && this._rootEl && this._rootEl.firstElementChild
          ? hydrateValue(this._rootEl, vnode, ctx)
          : renderValue(vnode, ctx)
        if (node && this._rootEl) {
          // hydrate 收养：不 append（已有节点）；否则 append
          if (node.parentNode !== this._rootEl) this._rootEl.appendChild(node)
        }
      }
    } else {
      if (this._rootEl) {
        patchValue(this._rootEl, this._rootEl.firstChild, this._oldVNode, vnode, ctx)
      }
    }
    this._oldVNode = vnode
  }

  /** 创建或复用 ctx（同一 URL 复用 $——路由实例） */
  private _ensureCtx(params: Record<string, string>): UIContext {
    if (this._ctx) {
      this._ctx.params = params
      return this._ctx
    }
    const dataCache = new Map<string, { value?: unknown; promise?: Promise<unknown> }>()
    // 组件注册表（D1：组件级 $ 重渲染）
    const registry = new Registry()

    // 路由实例级 $ 状态（handler 的 ctx.ui.$——首次创建，重渲染复用）
    // 渲染期（_renderAsync 内）赋值丢弃——handler 内赋值总被当前渲染消费
    // （$.x = $.x ?? init 首赋不触发二次渲染；await 后 $.users = data 同理）
    const state = createReactiveState(() => {
      if (!this._rendering) this._scheduleRender()
    })

    // 组件级 dirty 调度：仅重渲染 dirty 组件（不重跑 handler）；渲染期丢弃
    registry.onDirty(() => {
      if (!this._rendering) this._scheduleComponents()
    })

    const ctx: UIContext = {
      params,
      query: Object.fromEntries(new URLSearchParams(window.location.search)),
      __registry: registry,
      ui: {
        $: () => state as Record<string, any>,
        // dirty：当前组件（_selfId）→ markDirty；路由级 → scheduleRender
        dirty: () => {
          const selfId = (ctx as any)._selfId
          if (selfId && registry) {
            registry.markDirty(selfId)
          } else {
            this._scheduleRender()
          }
        },
        // render：同步落地——当前组件（_selfId）→ 立即重渲染；路由级 → 立即全量
        render: () => {
          const selfId = (ctx as any)._selfId
          if (selfId && registry) {
            rerenderDirtyComponents(registry, this._rootEl as Node | null)
          } else {
            void this._renderAsync()
          }
        },
        data: {
          async get<T>(key: string, fetcher?: () => Promise<T>): Promise<T | undefined> {
            const entry = dataCache.get(key)
            if (entry && 'value' in entry) return entry.value as T
            if (entry?.promise) return entry.promise as Promise<T>
            if (!fetcher) return undefined
            const promise = Promise.resolve()
              .then(() => fetcher())
              .then((val) => {
                dataCache.set(key, { value: val })
                return val
              })
            dataCache.set(key, { promise })
            return promise
          },
          set(key: string, value: unknown) {
            dataCache.set(key, { value })
          },
          has(key: string) {
            return dataCache.has(key)
          },
        },
      },
    }
    this._ctx = ctx
    return ctx
  }
}

/** serveUI — 绑定唯一根节点 + URL 变化驱动（= VDOM 落地，对齐 serve(router)） */
export function serveUI(
  ui: UIRouter,
  options: { root: string | Element; hydrate?: boolean },
): { close(): void } {
  const el = typeof options.root === 'string'
    ? document.querySelector(options.root)
    : options.root
  if (!el) throw new Error(`serveUI: root not found: ${options.root}`)
  ui.serve(el as Element, !!options.hydrate)
  return { close: () => ui.close() }
}
