import { WebSocketServer } from 'ws'
import { HttpError, type Context, type Handler, type Middleware, type MiddlewareMeta, type ErrorHandler, type WebSocket, type Closeable } from '../types.ts'
import {
  type WebSocketHandler,
  type WsUpgradeHandler,
  type Hub,
  createWsUpgradeHandler,
} from './ws.ts'
import type { GraphQLHandler } from '../graphql.ts'
import { createGraphqlRouter } from '../graphql.ts'
import { createTrie, trieRegister, trieMatch, trieFind, splitPath, type TrieNode } from '../../shared/router/trie.ts'
import { collectAll, collectAllWs, collectRoutes, collectWsRoutes, type RouteValue, type WsValue } from './collect.ts'
import { runChain } from './chain.ts'
import { createInMemoryHub } from './hub.ts'
import { noteHandlerError, clearHandlerError } from './error-counter.ts'

/**
 * WebSocket room hub — manages pub/sub groups for real-time messaging.
 *
 * Rooms are identified by string keys. Multiple WebSocket connections
 * can join/leave rooms, and messages are broadcast to all members.
 *
 * The default implementation is in-memory (single process).
 * Pass a custom Hub with Redis backend for multi-instance deployments.
 */
export type { Hub } from './ws.ts'

// ── Trie 负载（method 表——精确与通配同构——shared Trie 泛型 value） ──
// RouteValue/WsValue 类型与 collect 纯函数在 collect.ts（E 波次拆解）

const createRouteValue = (): RouteValue => ({
  handlers: new Map(),
  middlewares: new Map(),
})

// ── Router ──────────────────────────────────────────────────────

export class Router<T extends object = Context> {
  private root = createTrie<RouteValue>()
  private wsRoot = createTrie<WsValue>()
  private globalMws: Middleware[] = []
  private errorHandler?: ErrorHandler<T>
  private _hasWildcard = false
  private _hub?: Hub
  private _wss?: WebSocketServer
  private _ctxFields = new Set<string>()
  private _closeables: Closeable[] = []

  private get wss(): WebSocketServer {
    if (!this._wss) this._wss = new WebSocketServer({ noServer: true })
    return this._wss
  }

  private get hub(): Hub {
    if (!this._hub) this._hub = createInMemoryHub()
    return this._hub as Hub
  }

  wsHub(hub: Hub): this { this._hub = hub; return this }

  // ── Middleware & mounting ─────────────────────────────────

  use(mw: Middleware<Context, Context>): Router<T> {
    this.globalMws.push(mw as Middleware)
    this._checkMiddlewareMeta(mw, 'global')
    // If the middleware is also Closeable (e.g., postgres(), redis()), register it for cleanup.
    if (typeof (mw as any).close === 'function') {
      this._closeables.push(mw as unknown as Closeable)
    }
    return this
  }

  /**
   * Install a plugin — a function that configures the Router with
   * routes, middleware, and error handlers. Use when `.use()` isn't
   * enough because you need to call `app.get()`, `app.onError()`, etc.
   *
   * @example
   * ```ts
   * app.plugin(app => createReactApp(app, { pages: {...}, layout: '...', tailwind: {...} }))
   * ```
   */
  plugin(fn: (app: this) => void): this {
    fn(this)
    return this
  }

  mount(path: string, router: Router<any>): Router<T> {
    this._mountRouter(path, router)
    return this
  }

  onError(handler: ErrorHandler<T>): Router<T> {
    this.errorHandler = handler; return this
  }

  // ── Route registration ────────────────────────────────────

  get(path: string, ...rest: [...Middleware[], Handler<T> | Router<T>]): Router<T> {
    return this._route('GET', path, ...rest)
  }
  post(path: string, ...rest: [...Middleware[], Handler<T> | Router<T>]): Router<T> {
    return this._route('POST', path, ...rest)
  }
  put(path: string, ...rest: [...Middleware[], Handler<T> | Router<T>]): Router<T> {
    return this._route('PUT', path, ...rest)
  }
  delete(path: string, ...rest: [...Middleware[], Handler<T> | Router<T>]): Router<T> {
    return this._route('DELETE', path, ...rest)
  }
  patch(path: string, ...rest: [...Middleware[], Handler<T> | Router<T>]): Router<T> {
    return this._route('PATCH', path, ...rest)
  }
  head(path: string, ...rest: [...Middleware[], Handler<T> | Router<T>]): Router<T> {
    return this._route('HEAD', path, ...rest)
  }
  options(path: string, ...rest: [...Middleware[], Handler<T> | Router<T>]): Router<T> {
    return this._route('OPTIONS', path, ...rest)
  }
  all(path: string, ...rest: [...Middleware[], Handler<T> | Router<T>]): Router<T> {
    return this._route('*', path, ...rest)
  }

  ws(path: string, ...args: [...Middleware[], WebSocketHandler]): Router<T> {
    const handler = args.pop()! as WebSocketHandler
    const mws = args as Middleware[]
    trieRegister(this.wsRoot, path, { handler, middlewares: mws })
    return this
  }

  /**
   * Add GraphQL endpoint.
   * Mounts a sub-router with GET (for queries + GraphiQL) and POST (for mutations).
   *
   * ```ts
   * // At root
   * app.graphql(async (req, ctx) => ({ schema: 'type Query { hello: String }' }))
   *
   * // Or at a custom path
   * app.graphql('/graphql', async (req, ctx) => ({ schema: '...' }))
   * ```
   */
  graphql(pathOrHandler: string | GraphQLHandler, maybeHandler?: GraphQLHandler): this {
    const path = typeof pathOrHandler === 'string' ? pathOrHandler : '/'
    const handler = typeof pathOrHandler === 'string' ? maybeHandler! : pathOrHandler
    const sub = createGraphqlRouter(handler)
    this.mount(path, sub)
    return this
  }

  // ── Handler compilation ────────────────────────────────────

  handler(): Handler<T> {
    return (req, ctx) => {
      const url = new URL(req.url)
      return this.handle(req, ctx, splitPath(url.pathname))
    }
  }

  websocketHandler(): WsUpgradeHandler {
    return createWsUpgradeHandler(
      this.wss,
      (segments) => this.matchWsTrie(this.wsRoot, segments),
      this.hub,
    )
  }

  // ── Debug ──────────────────────────────────────────────────

  routes(): string[] {
    const result: string[] = []
    if (this.globalMws.length > 0) result.push(`MIDDLEWARE  [${this.globalMws.length} global]`)
    collectRoutes(this.root, '', result)
    collectWsRoutes(this.wsRoot, '', result)
    return result
  }

  // ── Private: Route impl ────────────────────────────────────

  private _route(method: string, path: string, ...args: [...Middleware[], Handler<T> | Router<T>]): Router<T> {
    return this._routeImpl(method, path, args as any[])
  }

  // args type is intentionally loose — _route() already validates the public API types.
  private _routeImpl(method: string, path: string, args: any[]): Router<T> {
    const last = args[args.length - 1]
    if (last instanceof Router) {
      this._mountRouter(path, last, args.slice(0, -1))
      return this
    }
    const handler = args.pop()
    const mws: Middleware[] = args

    // **route 级 meta 检查（ROUTER-CORE B1——2027-10 探针实证缺口）**：
    // route 中间件的 depends 语义与 global/mount 一致（未注册 ctx 依赖
    // 即抛错——静默跳过是违例：机制存在但只覆盖 global/mount）
    for (const mw of mws) this._checkMiddlewareMeta(mw, `${method} ${path}`)

    // 多方法合并（get+post 同路径并存——value 累积 method 表）
    const existing = trieFind(this.root, path)
    const isWildcard = path.includes('*')
    const prev = isWildcard ? existing?.wildcardValue : existing?.value
    // 同 method 重复注册抛错（set 前检查——合并对象同引用）
    if (!isWildcard && prev?.handlers.has(method)) {
      throw new Error(`[router] route conflict: ${method} ${path} already registered`)
    }
    const value: RouteValue = prev ?? createRouteValue()
    value.handlers.set(method, handler)
    if (mws.length > 0) value.middlewares.set(method, mws)

    const node = trieRegister(this.root, path, value, isWildcard)
    if (isWildcard) this._hasWildcard = true

    return this
  }

  // ── Private: Mount ─────────────────────────────────────────

  private _mountRouter(prefix: string, sub: Router<Context>, extraMws: Middleware[] = []): void {
    const base = prefix === '/' ? '' : prefix.replace(/\/$/, '')

    const mountMw: Middleware = (req, ctx, next) => {
      ctx.mountPath = (ctx.mountPath || '') + base
      return next(req, ctx)
    }

    const allExtra = extraMws.length === 0 && sub.globalMws.length === 0
      ? [mountMw]
      : [mountMw, ...extraMws, ...sub.globalMws]

    // Validate middleware meta for mounted sub-router middlewares
    for (const mw of allExtra) {
      this._checkMiddlewareMeta(mw, `mount:${prefix}`)
    }

    const routes = collectAll(sub.root)
    for (const { method, path, handler, middlewares } of routes) {
      this._routeImpl(method, base + path, [...allExtra, ...middlewares, handler])
    }

    const wsRoutes = collectAllWs(sub.wsRoot)
    for (const { path, handler, middlewares } of wsRoutes) {
      this.ws(base + path, ...allExtra as any[], ...middlewares, handler)
    }
  }

  // ── Private: Mount collect（新结构——node.value 负载） ──

  // ── Private: Matching ──────────────────────────────────────

  private matchTrie(method: string, segments: string[]): {
    kind: 'route' | 'not-allowed'; handler: Handler; mws: Middleware[]; params: Record<string, string>; methods?: string[]
  } | null {
    const m = trieMatch(this.root, segments)
    if (!m) return null
    const value = m.value
    // 通配命中：method 表直接查（route 或 null——通配不产生 405）
    if (m.wildcard) {
      const handler = value.handlers.get(method) || value.handlers.get('*')
      return handler
        ? { kind: 'route', handler, mws: value.middlewares.get(method) || value.middlewares.get('*') || [], params: m.params }
        : null
    }
    return this._resolveMatch(value, method, m.params)
  }

  private _resolveMatch(value: RouteValue, method: string, params: Record<string, string>): {
    kind: 'route' | 'not-allowed'; handler: Handler; mws: Middleware[]; params: Record<string, string>; methods?: string[]
  } | null {
    let handler = value.handlers.get(method) || value.handlers.get('*')
    // **HEAD fallback 的 mw 联动（ROUTER-CORE B2——2027-10 探针实证）**：
    // handler 回退 GET 时 mws 同步回退 GET 表（旧实现 mws 查 HEAD 表为空
    // ——GET route 中间件静默丢失——鉴权/日志类 mw 对 HEAD 请求失效）
    if (!handler && method === 'HEAD') handler = value.handlers.get('GET')
    if (handler) {
      const mws = value.middlewares.get(method)
        || value.middlewares.get('*')
        || (method === 'HEAD' ? value.middlewares.get('GET') : undefined)
        || []
      return { kind: 'route', handler, mws, params }
    }
    if (value.handlers.size > 0) {
      return {
        kind: 'not-allowed',
        handler: () => new Response('', { status: 405 }),
        mws: [],
        params,
        methods: [...value.handlers.keys()].filter((k: string) => k !== '*'),
      }
    }
    return null
  }

  private matchWsTrie(root: TrieNode<WsValue>, segments: string[]): {
    handler: WebSocketHandler; middlewares: Middleware[]; params: Record<string, string>
  } | null {
    const m = trieMatch(root, segments)
    if (!m) return null
    return { handler: m.value.handler, middlewares: m.value.middlewares, params: m.params }
  }

  // ── Private: Request handling ──────────────────────────────

  private async handle(req: Request, ctx: any, segments: string[]): Promise<Response> {
    // **输入防御（C3——2027-10 探针实证）**：param 段 decodeURIComponent
    // 对非法编码（%zz）抛 URIError——matchTrie 在链 try 外——裸抛到 serve。
    // 非法编码 URL 是客户端错误 → 400（非 500——语义准确）
    let match: ReturnType<typeof this.matchTrie>
    try { match = this.matchTrie(req.method, segments) }
    catch (e) {
      if (e instanceof URIError) {
        return Response.json({ error: 'Bad Request', reason: 'malformed percent-encoding' }, { status: 400 })
      }
      throw e
    }
    if (match) {
      Object.assign(ctx.params, match.params)
      if (match.kind === 'route') {
        // S6：match.mws 为空（常态）时复用 globalMws 引用——免每请求数组分配
        const mws = match.mws.length === 0 ? this.globalMws : [...this.globalMws, ...match.mws]
        try {
          const res = await runChain(mws, match.handler, req, ctx)
          // **恢复清出（C1）**：路由正常完成——错误状态清出（再错再报）
          clearHandlerError(`${req.method} ${'/' + segments.join('/')}`)
          return res
        }
        catch (e) { return this.handleError(e, req, ctx, '/' + segments.join('/')) }
      }
      // 405
      if (this.globalMws.length > 0) {
        try {
          return await runChain(this.globalMws, () => new Response('Method Not Allowed', {
            status: 405,
            headers: { Allow: (match.methods || []).join(', ') },
          }), req, ctx)
        } catch (e) { return this.handleError(e, req, ctx) }
      }
      return new Response('Method Not Allowed', { status: 405, headers: { Allow: (match.methods || []).join(', ') } })
    }

    // 404
    const nf = () => Response.json({ error: 'Not Found', path: '/' + segments.join('/'), method: req.method }, { status: 404 })
    if (this.globalMws.length > 0) {
      try { return await runChain(this.globalMws, nf, req, ctx) }
      catch (e) { return this.handleError(e, req, ctx) }
    }
    return nf()
  }

  private async handleError(e: unknown, req: Request, ctx: any, path?: string): Promise<Response> {
    const err = e instanceof Error ? e : new Error(String(e))
    // 自定义 onError 优先（可覆盖一切，含 HttpError）
    if (this.errorHandler) return this.errorHandler(err, req, ctx as T)
    // HttpError → 对应状态码（README 承诺：serve 自动返回对应状态码）
    if (err instanceof HttpError) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: err.status,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    // **日志去重（C1——error-counter 思想移植）**：同路由错误只报一次
    // （风暴不刷日志——恢复清出再报）；path 传入避免二次 new URL
    noteHandlerError(`${req.method} ${path ?? new URL(req.url).pathname}`, e)
    // 错误形态统一（S9）：500 = JSON { error }——与 response.ts serverError() 助手一致
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }


  // ── Private: Meta checking ──────────────────────────────────

  /**
   * Register a Closeable resource for graceful shutdown.
   * Used for modules created outside of middleware chain (e.g., sub-router state).
   */
  onClose(closeable: Closeable): this {
    this._closeables.push(closeable)
    return this
  }

  /**
   * Gracefully shut down all registered Closeable resources.
   * Called by serve() during shutdown.
   *
   * S2（SERVER-PERF-PLAN）：WS 客户端 1001 握手先行——
   * `server.closeAllConnections()` 对已升级的 WS 连接无效（实证：socket 残留、
   * 客户端 close 事件永不触发）——必须经 `wss.clients` 优雅关闭。
   */
  private _closed = false

  async close(): Promise<void> {
    // **幂等（C2——2027-10 探针实证：重复 close 重复执行 closeables）**：
    // 优雅关闭是终态操作——第二次调用 no-op（serve 生命周期 StopPhase
    // 同语义——双调用无副作用）
    if (this._closed) return
    this._closed = true
    if (this._wss && this._wss.clients.size > 0) {
      const clients = [...this._wss.clients]
      for (const client of clients) {
        try { client.close(1001, 'server shutting down') } catch { /* already closed */ }
      }
      // 等待握手完成（上限 500ms——强杀由 stop() 的 closeAllConnections 兑底）
      await new Promise<void>((resolve) => {
        let remaining = clients.length
        const done = () => { if (--remaining === 0) { clearTimeout(timer); resolve() } }
        const timer = setTimeout(resolve, 500)
        for (const c of clients) c.once('close', done)
      })
    }
    for (const c of this._closeables) {
      try { await c.close() } catch { /* ignore close errors */ }
    }
  }

  private _checkMiddlewareMeta(mw: unknown, location: string): void {
    const meta: MiddlewareMeta | undefined =
      (mw as Middleware).__meta ??
      (typeof mw === 'object' && mw && 'middleware' in mw
        ? (mw as { middleware(): Middleware }).middleware().__meta : undefined)
    if (!meta) return
    for (const dep of meta.depends) {
      if (!this._ctxFields.has(dep)) {
        throw new Error(
          `[weifuwu] Middleware at "${location}" depends on ctx.${dep} but it hasn't been registered.\n` +
          `  Register the provider before this middleware: app.use(${dep}())`)
      }
    }
    for (const field of meta.injects) this._ctxFields.add(field)
  }
}
