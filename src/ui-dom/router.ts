/**
 * weifuwu/ui-dom UIRouter — 纯路由（无渲染状态）
 *
 * 定稿架构职责划分：
 *   UIRouter = 路由表 + 匹配 + 中间件链（产 VNode）——不碰 DOM/渲染/状态
 *   serveUI   = 渲染运行时（VDOM 落地：registry/createUi/renderValue/patchValue）
 *
 * req = window.location，res = VNode，params/query 在 ctx（serve 组装 ctx 时注入）
 * handler = 异步组件：async (location, ctx) => vnode（$ 有效）
 * middleware = 两阶段 async：(location, ctx, children) => async (location, ctx) => vnode
 * layout 与 SSR 都是中间件
 */

import type { UIHandler, UIMiddleware, UIRouteDef } from './types.ts'
import type { VNode, WfuiContext, AppMiddleware } from './types.ts'

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

function joinPath(a: string, b: string): string {
  if (!b || b === '/') return a || '/'
  const left = a.endsWith('/') ? a.slice(0, -1) : a
  const right = b.startsWith('/') ? b : '/' + b
  return left + right
}

/** 匹配结果（serve 用它执行中间件链 + handler） */
export interface RouteMatch {
  handler: UIHandler
  params: Record<string, string>
  title?: string
}

/**
 * 前端路由应用 — new UIRouter()（纯路由）
 */
export class UIRouter<C extends object = {}> {
  private _routes: UIRouteDef[] = []
  private _middlewares: UIMiddleware[] = []
  /** ctx 注入中间件链（toast/confirm/notification 等——对齐后端 app.use 注入 ctx.xxx） */
  private _injections: AppMiddleware<any, any>[] = []
  /** 注入已完成标记（应用级 ctx——首次渲染时执行一次） */
  private _injected = false
  private _mode: 'hash' | 'history'
  private _notFound?: UIHandler

  constructor(options: UIRouterOptions = {}) {
    this._mode = options.mode ?? 'history'
  }

  get mode(): 'hash' | 'history' {
    return this._mode
  }

  /** ctx 注入中间件（toast/confirm 等——(ctx) => ctx，对齐后端 app.use 注入 ctx.xxx） */
  use<I extends object, O extends object>(mw: AppMiddleware<I, O>): UIRouter<C & O>
  /** 渲染中间件（layout/SSR 等）——包装 children 产 vnode */
  use<I extends object, O extends object>(mw: UIMiddleware<I, O>): UIRouter<C & O>
  /** 子路由挂载（= 后端 mount(path, subRouter)）——独立路由树：sub 的中间件/notFound/嵌套均生效 */
  use(prefix: string, sub: UIRouter): this
  use(arg: AppMiddleware | UIMiddleware | string, sub?: UIRouter): UIRouter<C> {
    if (typeof arg === 'string' && sub) {
      // 子路由：前缀匹配中间件——URL 在 prefix 下时交给 sub 路由树处理
      const parent = this
      const prefix = arg
      const mw: UIMiddleware = async (_location, ctx, children) => {
        // 当前相对路径（嵌套时 _handle 注入 __routePath；顶层回退 parent.getPath()——mode 感知）
        const path = (ctx as any).__routePath ?? parent.getPath()
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
    // 区分：AppMiddleware（1 参 ctx 注入）vs UIMiddleware（3 参渲染）
    if (arg.length <= 1) {
      this._injections.push(arg as AppMiddleware)
      return this as unknown as UIRouter<C & object>
    }
    this._middlewares.push(arg as UIMiddleware)
    return this as unknown as UIRouter<C>
  }

  /** 执行 ctx 注入链（首次渲染时一次——应用级 ctx，对齐 createApp.use 链） */
  private async _ensureInjected(ctx: WfuiContext): Promise<void> {
    if (this._injected) return
    this._injected = true
    for (const mw of this._injections) {
      await mw(ctx)
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

  /** 当前 URL 路径（serve 调用——mode 由 UIRouter 决定） */
  getPath(): string {
    return this._getPath(undefined as any)
  }

  private _getPath(ctx: any): string {
    const loc = (ctx as any)?.location ?? (typeof window !== 'undefined' ? window.location : null)
    if (this._mode === 'hash') return (loc?.hash ?? '').replace(/^#/, '') || '/'
    return loc?.pathname ?? '/'
  }

  /** 匹配 URL → { handler, params, title }（serve 执行渲染） */
  match(path: string): RouteMatch {
    let best: RouteMatch | null = null
    for (const def of this._routes) {
      const { re, keys } = compilePath(def.path)
      const m = path.match(re)
      if (!m) continue
      const params: Record<string, string> = {}
      for (let i = 0; i < keys.length; i++) params[keys[i]] = decodeURIComponent(m[i + 1])
      // 具体路由优先于通配/更短路径：取第一个匹配（注册顺序）
      best = { handler: def.handler, params, title: def.title }
      break
    }
    if (!best) {
      best = { handler: this._notFound ?? (() => null), params: {} }
    }
    return best
  }

  /**
   * 子路由树处理（供 use(prefix, sub) 调用）：
   * 相对路径匹配 + sub 的中间件链 + sub 的 notFound——支持任意嵌套。
   * 返回 VNode（无渲染——serve 落地）。
   */
  async _handle(relPath: string, location: Location, ctx: WfuiContext): Promise<VNode | null> {
    await this._ensureInjected(ctx)
    const match = this.match(relPath)
    if (match.title) document.title = match.title
    // 注入共享 ctx（params 是当前渲染请求的解析结果）
    ctx.params = match.params

    const handler = match.handler
    let inner: UIHandler = handler
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

  /** 顶层执行：中间件链 + handler → VNode（serve 调用，URL 变化时） */
  async execute(location: Location, ctx: WfuiContext, path: string): Promise<VNode | null> {
    await this._ensureInjected(ctx)
    const match = this.match(path)
    if (match.title) document.title = match.title
    ctx.params = match.params

    const handler = match.handler
    let inner: UIHandler = handler
    for (let i = this._middlewares.length - 1; i >= 0; i--) {
      const mw = this._middlewares[i]
      const child = inner
      inner = (await mw(location, ctx, child)) ?? child
    }
    return (await inner(location, ctx)) as VNode | null
  }
}
