/* eslint-disable no-console */
import { WebSocketServer } from 'ws'
import type { WebSocket, Context, Handler, Middleware, MiddlewareMeta, ErrorHandler } from '../types.ts'
import { createHub, type Hub } from '../hub.ts'
import { isProd } from './env.ts'
import {
  type WebSocketHandler,
  type WsUpgradeHandler,
  createWsUpgradeHandler,
} from './ws.ts'

// Augment Context with WebSocket helpers
declare module '../types.ts' {
  interface Context {
    ws: {
      state: Record<string, unknown>
      json(data: unknown): void
      join(room: string): void
      leave(room: string): void
      sendRoom(room: string, data: unknown): void
    }
  }
}

// ── Trie types ──────────────────────────────────────────────────

type TrieNode = {
  children: Map<string, TrieNode>
  handlers: Map<string, Handler>
  middlewares: Map<string, Middleware[]>
  param?: string
  wildcard?: boolean
}

type WsTrieNode = {
  children: Map<string, WsTrieNode>
  handler?: WebSocketHandler
  middlewares: Middleware[]
  param?: string
  wildcard?: boolean
}

const createTrieNode = (): TrieNode => ({
  children: new Map(),
  handlers: new Map(),
  middlewares: new Map(),
})

const createWsNode = (): WsTrieNode => ({
  children: new Map(),
  middlewares: [],
})

// ── Trie helpers (generic) ──────────────────────────────────────

interface TrieNodeBase<T> {
  children: Map<string, T>
  param?: string
  wildcard?: boolean
}

function createParamChild<T extends TrieNodeBase<T>>(
  node: T, segment: string, createNode: () => T,
): T {
  const paramName = segment.slice(1)
  if (!node.children.has(':')) {
    const child = createNode()
    child.param = paramName
    node.children.set(':', child)
  }
  const child = node.children.get(':')!
  if (child.param !== paramName) {
    throw new Error(
      `Param name conflict: ":${child.param}" already registered, cannot register ":"${paramName}"`,
    )
  }
  return child
}

function getOrCreateChild<T extends TrieNodeBase<T>>(
  node: T, segment: string, createNode: () => T, allowWildcard: boolean,
): T {
  if (allowWildcard && segment === '*') { node.wildcard = true; return node }
  if (segment.startsWith(':')) return createParamChild(node, segment, createNode)
  if (!node.children.has(segment)) node.children.set(segment, createNode())
  return node.children.get(segment)!
}

function matchChild<T extends TrieNodeBase<T>>(
  node: T, segment: string, params: Record<string, string>, allowWildcard = false,
): T | null {
  if (node.children.has(segment)) return node.children.get(segment)!
  if (node.children.has(':')) {
    const child = node.children.get(':')!
    if (child.param) params[child.param] = decodeURIComponent(segment)
    return child
  }
  if (allowWildcard && node.wildcard) return node
  return null
}

// ── Router ──────────────────────────────────────────────────────

const METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'] as const

export class Router<T extends Context = Context> {
  private root = createTrieNode()
  private wsRoot = createWsNode()
  private globalMws: Middleware[] = []
  private errorHandler?: ErrorHandler<T>
  private _hasWildcard = false
  private _hub?: Hub
  private _wss?: WebSocketServer
  private _ctxFields = new Set<string>()

  private get wss(): WebSocketServer {
    if (!this._wss) this._wss = new WebSocketServer({ noServer: true })
    return this._wss
  }

  private get hub(): Hub {
    if (!this._hub) this._hub = createHub()
    return this._hub
  }

  wsHub(hub: Hub): this { this._hub = hub; return this }

  // ── Middleware & mounting ─────────────────────────────────

  use(mw: Middleware<Context, Context>): Router<T> {
    this.globalMws.push(mw as Middleware)
    this._checkMiddlewareMeta(mw, 'global')
    return this
  }

  mount(path: string, router: Router<Context>): Router<T> {
    this._mountRouter(path, router)
    return this
  }

  onError(handler: ErrorHandler<T>): Router<T> {
    this.errorHandler = handler; return this
  }

  // ── Route registration ────────────────────────────────────

  get(path: string, ...rest: [...Middleware[], Handler | Router<Context>]): Router<T> {
    return this._route('GET', path, ...rest)
  }
  post(path: string, ...rest: [...Middleware[], Handler | Router<Context>]): Router<T> {
    return this._route('POST', path, ...rest)
  }
  put(path: string, ...rest: [...Middleware[], Handler | Router<Context>]): Router<T> {
    return this._route('PUT', path, ...rest)
  }
  delete(path: string, ...rest: [...Middleware[], Handler | Router<Context>]): Router<T> {
    return this._route('DELETE', path, ...rest)
  }
  patch(path: string, ...rest: [...Middleware[], Handler | Router<Context>]): Router<T> {
    return this._route('PATCH', path, ...rest)
  }
  head(path: string, ...rest: [...Middleware[], Handler | Router<Context>]): Router<T> {
    return this._route('HEAD', path, ...rest)
  }
  options(path: string, ...rest: [...Middleware[], Handler | Router<Context>]): Router<T> {
    return this._route('OPTIONS', path, ...rest)
  }
  all(path: string, ...rest: [...Middleware[], Handler | Router<Context>]): Router<T> {
    return this._route('*', path, ...rest)
  }

  ws(path: string, ...args: [...Middleware[], WebSocketHandler]): Router<T> {
    const handler = args.pop()! as WebSocketHandler
    const mws = args as Middleware[]
    let node = this.wsRoot
    for (const segment of this.splitPath(path)) {
      node = getOrCreateChild(node, segment, createWsNode, true)
    }
    node.handler = handler
    node.middlewares = mws
    return this
  }

  // ── Handler compilation ────────────────────────────────────

  handler(): Handler<T> {
    return (req, ctx) => {
      const url = new URL(req.url)
      return this.handle(req, ctx, this.splitPath(url.pathname))
    }
  }

  websocketHandler(): WsUpgradeHandler {
    return createWsUpgradeHandler(
      this.wss, this.hub,
      (segments) => this.matchWsTrie(this.wsRoot, segments),
      this.globalMws,
      (mws, h, req, ctx) => this.runChain(mws, h, req, ctx),
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

  private _route(method: string, path: string, ...args: [...Middleware[], Handler | Router<Context>]): Router<T> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return this._routeImpl(method, path, args as any[])
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _routeImpl(method: string, path: string, args: any[]): Router<T> {
    const last = args[args.length - 1]
    if (last instanceof Router) {
      this._mountRouter(path, last, args.slice(0, -1))
      return this
    }
    const handler = args.pop()
    const mws: Middleware[] = args
    let node = this.root

    for (const segment of this.splitPath(path)) {
      if (segment === '*') {
        this._hasWildcard = true
        if (this.splitPath(path).indexOf('*') < this.splitPath(path).length - 1) {
          console.warn(`Route "${path}": segments after "*" are ignored`)
        }
        node.wildcard = true
        node.handlers.set(method, handler)
        if (mws.length > 0) node.middlewares.set(method, mws)
        return this
      }
      node = getOrCreateChild(node, segment, createTrieNode, false)
    }

    if (!isProd() && node.handlers.has(method)) {
      console.warn(`[router] route conflict: ${method} ${path} overwrites existing handler`)
    }
    node.handlers.set(method, handler)
    if (mws.length > 0) node.middlewares.set(method, mws)
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

    // Collect and register HTTP routes
    const routes: Array<{ method: string; path: string; handler: Handler; middlewares: Middleware[] }> = []
    this._collect(sub.root, '', routes)
    for (const { method, path, handler, middlewares } of routes) {
      this._routeImpl(method, base + path, [...allExtra, ...middlewares, handler])
    }

    // Collect and register WS routes
    const wsRoutes: Array<{ path: string; handler: WebSocketHandler; middlewares: Middleware[] }> = []
    this._collectWs(sub.wsRoot, '', wsRoutes)
    for (const { path, handler, middlewares } of wsRoutes) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this.ws(base + path, ...allExtra as any[], ...middlewares, handler)
    }
  }

  private _collect(node: TrieNode, prefix: string, result: Array<{
    method: string; path: string; handler: Handler; middlewares: Middleware[]
  }>): void {
    for (const [method, handler] of node.handlers) {
      const rmws = node.middlewares.get(method) || []
      const suffix = node.wildcard ? '/*' : ''
      result.push({ method, path: (prefix || '/') + suffix, handler, middlewares: [...rmws] })
    }
    for (const [seg, child] of node.children) {
      this._collect(child, prefix + '/' + (seg === ':' ? `:${child.param}` : seg), result)
    }
  }

  private _collectWs(node: WsTrieNode, prefix: string, result: Array<{
    path: string; handler: WebSocketHandler; middlewares: Middleware[]
  }>, mwsAcc: Middleware[] = []): void {
    const mws = [...mwsAcc, ...node.middlewares]
    if (node.handler) result.push({ path: prefix || '/', handler: node.handler, middlewares: mws })
    for (const [seg, child] of node.children) {
      this._collectWs(child, prefix + '/' + (seg === ':' ? `:${child.param}` : seg), result, mws)
    }
  }

  // ── Private: Matching ──────────────────────────────────────

  private splitPath(path: string): string[] { return path.split('/').filter(Boolean) }

  // Pretty-print route listing (for debugging)
  private _collectRoutes(node: TrieNode, prefix: string, result: string[]): void {
    for (const [method] of node.handlers) {
      const m = method === '*' ? 'ANY' : method
      const path = (prefix || '/') + (node.wildcard ? '/*' : '')
      const middlewares = node.middlewares.get(method)
      const mwCount = middlewares ? ` (+${middlewares.length} mw)` : ''
      result.push(`${m.padEnd(7)} ${path}${mwCount}`)
    }
    for (const [seg, child] of node.children) {
      const segment = seg === ':' ? `:${child.param}` : seg
      this._collectRoutes(child, prefix + '/' + segment, result)
    }
  }

  private _collectWsRoutes(node: WsTrieNode, prefix: string, result: string[]): void {
    if (node.handler) {
      const path = prefix || '/'
      const mwCount = node.middlewares.length ? ` (+${node.middlewares.length} mw)` : ''
      result.push(`WS       ${path}${mwCount}`)
    }
    for (const [seg, child] of node.children) {
      const segment = seg === ':' ? `:${child.param}` : seg
      this._collectWsRoutes(child, prefix + '/' + segment, result)
    }
  }

  /** Two-pass trie matching: exact first, then wildcard fallback. */
  private matchTrie(method: string, segments: string[]): {
    kind: 'route' | 'not-allowed'; handler: Handler; mws: Middleware[]; params: Record<string, string>; methods?: string[]
  } | null {
    // Pass 1: exact + param matching
    let node = this.root
    const params: Record<string, string> = {}
    for (const seg of segments) {
      const next = matchChild(node, seg, params, false)
      if (!next) {
        // Try wildcard fallback
        return this._wildcardMatch(method, segments)
      }
      node = next
    }
    return this._resolveMatch(node, method, params, segments.length)
  }

  /** Fallback: search for a wildcard ancestor. */
  private _wildcardMatch(method: string, segments: string[]): {
    kind: 'route'; handler: Handler; mws: Middleware[]; params: Record<string, string>
  } | null {
    if (!this._hasWildcard) return null
    let node = this.root
    const params: Record<string, string> = {}
    for (let i = 0; i < segments.length; i++) {
      if (node.wildcard) {
        const h = node.handlers.get('*') || node.handlers.get(method) || (method === 'HEAD' ? node.handlers.get('GET') : undefined)
        if (h) {
          params['*'] = segments.slice(i).join('/')
          return { kind: 'route', handler: h, mws: node.middlewares.get(method) || node.middlewares.get('*') || [], params }
        }
      }
      const next = matchChild(node, segments[i], params, false)
      if (!next) return null
      node = next
    }
    return null
  }

  /** Resolve a matched trie node → handler or 405. */
  private _resolveMatch(node: TrieNode, method: string, params: Record<string, string>, _segLen: number): {
    kind: 'route' | 'not-allowed'; handler: Handler; mws: Middleware[]; params: Record<string, string>; methods?: string[]
  } | null {
    let handler = node.handlers.get(method) || node.handlers.get('*')
    if (!handler && method === 'HEAD') handler = node.handlers.get('GET')
    if (node.wildcard) params['*'] = ''
    if (handler) {
      return { kind: 'route', handler, mws: node.middlewares.get(method) || node.middlewares.get('*') || [], params }
    }
    if (node.handlers.size > 0) {
      return {
        kind: 'not-allowed',
        handler: () => new Response('', { status: 405 }),
        mws: [],
        params,
        methods: [...node.handlers.keys()].filter((k: string) => k !== '*'),
      }
    }
    return null
  }

  private matchWsTrie(root: WsTrieNode, segments: string[]): {
    handler: WebSocketHandler; middlewares: Middleware[]; params: Record<string, string>
  } | null {
    let node: WsTrieNode = root
    const params: Record<string, string> = {}
    for (const seg of segments) {
      const next = matchChild(node, seg, params, true)
      if (!next) return null
      node = next
    }
    return node.handler ? { handler: node.handler, middlewares: node.middlewares, params } : null
  }

  // ── Private: Request handling ──────────────────────────────

  private async handle(req: Request, ctx: Context, segments: string[]): Promise<Response> {
    const match = this.matchTrie(req.method, segments)
    if (match) {
      Object.assign(ctx.params, match.params)
      if (match.kind === 'route') {
        try { return await this.runChain([...this.globalMws, ...match.mws], match.handler, req, ctx) }
        catch (e) { return this.handleError(e, req, ctx) }
      }
      // 405 — run global middleware, then return Method Not Allowed
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
    if (this.globalMws.length > 0) {
      try { return await this.runChain(this.globalMws, () => this._notFound(req, segments), req, ctx) }
      catch (e) { return this.handleError(e, req, ctx) }
    }
    return this._notFound(req, segments)
  }

  private _notFound(_req: Request, segments: string[]): Response {
    return isProd()
      ? new Response('Not Found', { status: 404 })
      : Response.json({ error: 'Not Found', path: '/' + segments.join('/'), method: _req.method }, { status: 404 })
  }

  private async handleError(e: unknown, req: Request, ctx: Context): Promise<Response> {
    const err = e instanceof Error ? e : new Error(String(e))
    console.error(err)
    return this.errorHandler ? this.errorHandler(err, req, ctx as T) : new Response('Internal Server Error', { status: 500 })
  }

  // ── Private: Middleware chain ───────────────────────────────

  private async runChain(
    mws: Middleware[], finalHandler: Handler, req: Request, ctx: Context,
  ): Promise<Response> {
    if (mws.length === 0) return finalHandler(req, ctx)
    let i = 0
    const dispatch: Handler = (r, c) => {
      if (i >= mws.length) return Promise.resolve(finalHandler(r, c))
      const mw = mws[i++]
      let called = false
      const next: Handler = (r2, c2) => {
        if (called) { console.warn('[router] next() called more than once — ignoring'); return Promise.resolve(new Response('', { status: 499 })) }
        called = true
        return dispatch(r2, c2)
      }
      return Promise.resolve(mw(r, c, next as Parameters<typeof mw>[2]))
    }
    return dispatch(req, ctx)
  }

  // ── Private: Meta checking ──────────────────────────────────

  private _checkMiddlewareMeta(mw: unknown, location: string): void {
    const meta: MiddlewareMeta | undefined =
      (mw as Middleware).__meta ??
      (typeof mw === 'object' && mw && 'middleware' in mw
        ? (mw as { middleware(): Middleware }).middleware().__meta : undefined)
    if (!meta) return
    for (const dep of meta.depends) {
      if (!this._ctxFields.has(dep)) {
        console.warn(
          `[weifuwu] Middleware at "${location}" depends on ctx.${dep} but it hasn't been registered yet.\n` +
          `  Register the provider before this middleware:\n` +
          `    app.use(${dep}())  // add before this middleware\n` +
          `  Current ctx fields: [${[...this._ctxFields].join(', ')}]`)
      }
    }
    for (const field of meta.injects) this._ctxFields.add(field)
  }
}
