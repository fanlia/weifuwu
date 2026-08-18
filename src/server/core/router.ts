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

type RouteValue = {
  handlers: Map<string, Handler>
  middlewares: Map<string, Middleware[]>
}

type WsValue = {
  handler: WebSocketHandler
  middlewares: Middleware[]
}

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
    return this._hub
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
    this._collectRoutes(this.root, '', result)
    this._collectWsRoutes(this.wsRoot, '', result)
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

    const routes = this._collectAll(sub.root)
    for (const { method, path, handler, middlewares } of routes) {
      this._routeImpl(method, base + path, [...allExtra, ...middlewares, handler])
    }

    const wsRoutes = this._collectAllWs(sub.wsRoot)
    for (const { path, handler, middlewares } of wsRoutes) {
      this.ws(base + path, ...allExtra as any[], ...middlewares, handler)
    }
  }

  // ── Private: Mount collect（新结构——node.value 负载） ──

  private _collectAll(node: TrieNode<RouteValue>, prefix = ''): Array<{
    method: string; path: string; handler: Handler; middlewares: Middleware[]
  }> {
    const out: Array<{ method: string; path: string; handler: Handler; middlewares: Middleware[] }> = []
    for (const [method, handler] of node.value?.handlers ?? []) {
      const rmws = node.value?.middlewares.get(method) || []
      const suffix = node.wildcard ? '/*' : ''
      out.push({ method, path: (prefix || '/') + suffix, handler, middlewares: [...rmws] })
    }
    for (const [seg, child] of node.children) {
      out.push(...this._collectAll(child, prefix + '/' + (seg === ':' ? `:${child.param}` : seg)))
    }
    return out
  }

  private _collectAllWs(node: TrieNode<WsValue>, prefix = ''): Array<{
    path: string; handler: WebSocketHandler; middlewares: Middleware[]
  }> {
    const out: Array<{ path: string; handler: WebSocketHandler; middlewares: Middleware[] }> = []
    if (node.value?.handler) out.push({ path: prefix || '/', handler: node.value.handler, middlewares: [...node.value.middlewares] })
    for (const [seg, child] of node.children) {
      out.push(...this._collectAllWs(child, prefix + '/' + (seg === ':' ? `:${child.param}` : seg)))
    }
    return out
  }

  // ── Private: Matching ──────────────────────────────────────

  private _collectRoutes(node: TrieNode<RouteValue>, prefix: string, result: string[]): void {
    for (const [method] of node.value?.handlers ?? []) {
      const m = method === '*' ? 'ANY' : method
      const path = (prefix || '/') + (node.wildcard ? '/*' : '')
      const middlewares = node.value?.middlewares.get(method)
      const mwCount = middlewares ? ` (+${middlewares.length} mw)` : ''
      result.push(`${m.padEnd(7)} ${path}${mwCount}`)
    }
    for (const [seg, child] of node.children) {
      const segment = seg === ':' ? `:${child.param}` : seg
      this._collectRoutes(child, prefix + '/' + segment, result)
    }
  }

  private _collectWsRoutes(node: TrieNode<WsValue>, prefix: string, result: string[]): void {
    if (node.value?.handler) {
      const path = prefix || '/'
      const mwCount = node.value.middlewares.length ? ` (+${node.value.middlewares.length} mw)` : ''
      result.push(`WS       ${path}${mwCount}`)
    }
    for (const [seg, child] of node.children) {
      const segment = seg === ':' ? `:${child.param}` : seg
      this._collectWsRoutes(child, prefix + '/' + segment, result)
    }
  }

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
    if (!handler && method === 'HEAD') handler = value.handlers.get('GET')
    if (handler) {
      return { kind: 'route', handler, mws: value.middlewares.get(method) || value.middlewares.get('*') || [], params }
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
    const match = this.matchTrie(req.method, segments)
    if (match) {
      Object.assign(ctx.params, match.params)
      if (match.kind === 'route') {
        try { return await this.runChain([...this.globalMws, ...match.mws], match.handler, req, ctx) }
        catch (e) { return this.handleError(e, req, ctx) }
      }
      // 405
      if (this.globalMws.length > 0) {
        try {
          return await this.runChain(this.globalMws, () => new Response('Method Not Allowed', {
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
      try { return await this.runChain(this.globalMws, nf, req, ctx) }
      catch (e) { return this.handleError(e, req, ctx) }
    }
    return nf()
  }

  private async handleError(e: unknown, req: Request, ctx: any): Promise<Response> {
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
    // Log unexpected errors so developers can debug
    console.error(`[router] ${req.method} ${new URL(req.url).pathname}:`, err.stack || err.message || err)
    return new Response('Internal Server Error', { status: 500 })
  }

  // ── Private: Middleware chain ───────────────────────────────

  private async runChain(
    mws: Middleware[], finalHandler: Handler, req: Request, ctx: any,
  ): Promise<Response> {
    if (mws.length === 0) return finalHandler(req, ctx)
    let i = 0
    const dispatch: Handler = (r, c) => {
      if (i >= mws.length) return Promise.resolve(finalHandler(r, c))
      const mw = mws[i++]
      let called = false
      const next: Handler = (r2, c2) => {
        if (called) throw new Error('[router] next() called more than once in middleware')
        called = true
        return dispatch(r2, c2)
      }
      return Promise.resolve(mw(r, c, next as Parameters<typeof mw>[2]))
    }
    return dispatch(req, ctx)
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
   */
  async close(): Promise<void> {
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

/**
 * 创建内存 Hub — WebSocket 房间的简单发布/订阅实现。
 * 每个房间是一个字符串 key，WebSocket 通过 `join`/`leave` 管理订阅。
 */
function createInMemoryHub(): Hub {
  const rooms = new Map<string, Set<WebSocket>>()
  const wsRooms = new Map<WebSocket, Set<string>>()

  return {
    join(key: string, ws: WebSocket) {
      let members = rooms.get(key)
      if (!members) { members = new Set(); rooms.set(key, members) }
      members.add(ws)
      let keys = wsRooms.get(ws)
      if (!keys) { keys = new Set(); wsRooms.set(ws, keys) }
      keys.add(key)
    },
    leave(ws: WebSocket) {
      const keys = wsRooms.get(ws)
      if (!keys) return
      for (const key of keys) {
        const members = rooms.get(key)
        if (members) { members.delete(ws); if (members.size === 0) rooms.delete(key) }
      }
      wsRooms.delete(ws)
    },
    send(key: string, message: string) {
      const members = rooms.get(key)
      if (!members) return
      for (const ws of members) {
        try { ws.send(message) } catch { /* ignore disconnected */ }
      }
    },
    async close() {
      rooms.clear()
      wsRooms.clear()
    },
  }
}
