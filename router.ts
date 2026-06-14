import { WebSocketServer } from 'ws'
import type { WebSocket } from './vendor.ts'
import http, { type IncomingMessage } from 'node:http'
import type { Duplex } from 'node:stream'
import type { Context, Handler, Middleware, ErrorHandler } from './types.ts'
import { createHub } from './hub.ts'
import type { Hub } from './hub.ts'

import { isProd } from './env.ts'

export type WebSocketHandler = {
  open?: (ws: WebSocket, ctx: Context) => void | Promise<void>
  message?: (ws: WebSocket, ctx: Context, data: string | Buffer) => void | Promise<void>
  close?: (ws: WebSocket, ctx: Context) => void | Promise<void>
  error?: (ws: WebSocket, ctx: Context, error: Error) => void | Promise<void>
}

type TrieNode = {
  children: Map<string, TrieNode>
  handlers: Map<string, Handler>
  middlewares: Map<string, Middleware[]>
  param?: string
  wildcard?: boolean
  pathMws: Middleware[]
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
  pathMws: [],
})

const createWsNode = (): WsTrieNode => ({
  children: new Map(),
  middlewares: [],
})

interface TrieNodeBase<T> {
  children: Map<string, T>
  param?: string
  wildcard?: boolean
}

function createParamChild<T extends TrieNodeBase<T>>(
  node: T,
  segment: string,
  createNode: () => T,
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
  node: T,
  segment: string,
  createNode: () => T,
  allowWildcard: boolean,
): T {
  if (allowWildcard && segment === '*') {
    node.wildcard = true
    return node
  }
  if (segment.startsWith(':')) return createParamChild(node, segment, createNode)
  if (!node.children.has(segment)) node.children.set(segment, createNode())
  return node.children.get(segment)!
}

function matchChild<T extends TrieNodeBase<T>>(
  node: T,
  segment: string,
  params: Record<string, string>,
  allowWildcard = false,
): T | null {
  if (node.children.has(segment)) return node.children.get(segment)!
  if (node.children.has(':')) {
    const child = node.children.get(':')!
    if (child.param) params[child.param] = segment
    return child
  }
  if (allowWildcard && node.wildcard) return node
  return null
}

type WsMatchResult = {
  handler: WebSocketHandler
  middlewares: Middleware[]
  params: Record<string, string>
} | null

type WsUpgradeHandler = (req: IncomingMessage, socket: Duplex, head: Buffer) => void

// Router<T> — T accumulates types from global middleware calls via use(mw).
// Route-level middleware does not change the Router's type parameter.
export class Router<T extends Context = Context> {
  private root: TrieNode = createTrieNode()
  private wsRoot: WsTrieNode = createWsNode()
  private globalMws: Middleware[] = []
  private errorHandler?: ErrorHandler<T>
  private _hasWildcard = false
  private _hub?: Hub
  private _wss?: WebSocketServer
  private get wss(): WebSocketServer {
    if (!this._wss) this._wss = new WebSocketServer({ noServer: true })
    return this._wss
  }

  private get hub(): Hub {
    if (!this._hub) this._hub = createHub()
    return this._hub
  }

  /** Inject a custom hub (e.g. with Redis for cross-process broadcast). */
  wsHub(hub: Hub): this {
    this._hub = hub
    return this
  }

  // Global middleware — accumulates types into Router<T>.
  // The middleware's In type is Context (base); Out is what it injects.
  // Router accumulates via intersection: Router<T & Out>
  use<Out extends Context>(mw: Middleware<Context, Out>): Router<T & Out>
  // Path-scoped middleware — does not accumulate
  use(path: string, mw: Middleware<T, T>): Router<T>
  // Mount sub-router — flattens into parent, does not accumulate
  use(path: string, router: Router<any>): Router<T>
  // Module with .middleware() — auto-register middleware + mount at /
  use(mod: Router & { middleware: () => Middleware }): Router<T>
  use(arg1: string | Middleware<any, any> | (Router & { middleware: () => Middleware }), arg2?: Router<any> | Middleware<T, T>): Router<any> {
    if (typeof arg1 === 'string') {
      if (arg2 instanceof Router) {
        this._mountRouter(arg1, arg2)
      } else if (typeof arg2 === 'function') {
        let node = this.root
        for (const segment of this.splitPath(arg1)) {
          node = getOrCreateChild(node, segment, createTrieNode, false)
        }
        node.pathMws.push(arg2 as unknown as Middleware)
      }
    } else if (typeof arg1 === 'function') {
      this.globalMws.push(arg1 as unknown as Middleware)
    } else if (typeof arg1 === 'object' && arg1 !== null && 'middleware' in arg1 && typeof (arg1 as any).middleware === 'function' && arg1 instanceof Router) {
      // Auto-register modules with .middleware() — e.g. theme(), i18n(), analytics()
      // Registers both the middleware and mounts routes at /
      const mod = arg1 as Router & { middleware: () => Middleware }
      this.globalMws.push(mod.middleware() as unknown as Middleware)
      this._mountRouter('/', mod as Router)
    }
    return this
  }

  // Route registration — returns Router<T> unchanged.
  // Route-level middleware and handlers get Context<T>.
  get(path: string, ...args: [...Middleware<T, T>[], Handler<T> | Router<any>]): Router<T> {
    return this._route('GET', path, ...args)
  }

  post(path: string, ...args: [...Middleware<T, T>[], Handler<T> | Router<any>]): Router<T> {
    return this._route('POST', path, ...args)
  }

  put(path: string, ...args: [...Middleware<T, T>[], Handler<T> | Router<any>]): Router<T> {
    return this._route('PUT', path, ...args)
  }

  delete(path: string, ...args: [...Middleware<T, T>[], Handler<T> | Router<any>]): Router<T> {
    return this._route('DELETE', path, ...args)
  }

  patch(path: string, ...args: [...Middleware<T, T>[], Handler<T> | Router<any>]): Router<T> {
    return this._route('PATCH', path, ...args)
  }

  head(path: string, ...args: [...Middleware<T, T>[], Handler<T> | Router<any>]): Router<T> {
    return this._route('HEAD', path, ...args)
  }

  options(path: string, ...args: [...Middleware<T, T>[], Handler<T> | Router<any>]): Router<T> {
    return this._route('OPTIONS', path, ...args)
  }

  all(path: string, ...args: [...Middleware<T, T>[], Handler<T> | Router<any>]): Router<T> {
    return this._route('*', path, ...args)
  }

  onError(handler: ErrorHandler<T>): Router<T> {
    this.errorHandler = handler
    return this
  }

  private _route(method: string, path: string, ...args: [...Middleware<T, T>[], Handler<T> | Router<any>]): Router<T> {
    return this._routeImpl(method, path, args)
  }

  /** Internal route registration — no type constraints (used by _mountRouter). */
  private _routeImpl(method: string, path: string, args: any[]): Router<T> {
    const last = args[args.length - 1]
    if (last instanceof Router) {
      this._mountRouter(path, last, args.slice(0, -1))
      return this
    }
    const handler = args.pop()
    const middlewares: Middleware[] = args
    const segments = this.splitPath(path)
    let node = this.root

    for (const segment of segments) {
      if (segment === '*') {
        this._hasWildcard = true
        const remaining = segments.indexOf('*') < segments.length - 1
        if (remaining) {
          console.warn(`Route "${path}": segments after "*" are ignored`)
        }
        node.wildcard = true
        node.handlers.set(method, handler)
        if (middlewares.length > 0) node.middlewares.set(method, middlewares)
        return this
      }
      node = getOrCreateChild(node, segment, createTrieNode, false)
    }

    if (!isProd() && node.handlers.has(method)) {
      console.warn(
        `[router] route conflict: ${method} ${path} overwrites existing handler`
      )
    }
    node.handlers.set(method, handler)
    if (middlewares.length > 0) node.middlewares.set(method, middlewares)
    return this
  }

  ws(path: string, ...args: [...Middleware<T, T>[], WebSocketHandler]): Router<T> {
    const handler = args.pop()! as WebSocketHandler
    const middlewares = args as unknown as Middleware[]
    const segments = this.splitPath(path)
    let node = this.wsRoot

    for (const segment of segments) {
      node = getOrCreateChild(node, segment, createWsNode, true)
    }

    node.handler = handler
    node.middlewares = middlewares
    return this
  }

  handler(): Handler<T> {
    return (req, ctx) => {
      const url = new URL(req.url)
      return this.handle(req, ctx as Context, this.splitPath(url.pathname))
    }
  }

  /** Returns a human-readable list of all registered routes. Useful for debugging. */
  routes(): string[] {
    const result: string[] = []
    if (this.globalMws.length > 0) {
      result.push(`MIDDLEWARE  [${this.globalMws.length} global]`)
    }
    this._collectRoutes(this.root, '', result)
    this._collectWsRoutes(this.wsRoot, '', result)
    return result
  }

  private _collectRoutes(node: TrieNode, prefix: string, result: string[]): void {
    for (const [method, handler] of node.handlers) {
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

  websocketHandler(): WsUpgradeHandler {
    const wsRoot = this.wsRoot
    const router = this

    return (req, socket, head) => {
      const url = new URL(req.url ?? '/', 'http://localhost')
      const segments = url.pathname.split('/').filter(Boolean)

      const match = router.matchWsTrie(wsRoot, segments)
      if (!match) { socket.destroy(); return }

      const query = Object.fromEntries(url.searchParams)
      const ctx = { params: match.params, query } as Context

      const allMws = router.globalMws.length === 0 && match.middlewares.length === 0
        ? [] as Middleware[]
        : [...router.globalMws, ...match.middlewares]

      if (allMws.length === 0) {
        upgradeSocket(router.wss, req, socket, head, match.handler, ctx, router.hub)
        return
      }

      const finalHandler: Handler = () => {
        try {
          upgradeSocket(router.wss, req, socket, head, match.handler, ctx, router.hub)
        } catch {
          socket.destroy()
          return new Response('WebSocket upgrade failed', { status: 500 })
        }
        return new Response(null, { status: 200 })
      }

      const webReq = new Request(url.href, {
        method: req.method ?? 'GET',
        headers: nodeReqHeadersToRecord(req.headers),
      })

      void router.runChain(allMws, finalHandler, webReq, ctx).then((result) => {
        if (result.status >= 400) {
          sendHttpResponseOnSocket(socket, result)
        }
      }).catch(() => {
        socket.destroy()
      })
    }
  }

  private _mountRouter(prefix: string, sub: Router<any>, extraMws: Middleware[] = []): void {
    const base = prefix === '/' ? '' : prefix.replace(/\/$/, '')

    const mountMw: Middleware = (req, ctx, next) => {
      ctx.mountPath = (ctx.mountPath || '') + base
      return next(req, ctx)
    }

    const allExtra = extraMws.length === 0 && sub.globalMws.length === 0
      ? [mountMw]
      : [mountMw, ...extraMws, ...sub.globalMws]

    const routes: Array<{ method: string; path: string; handler: Handler; middlewares: Middleware[] }> = []
    this._collect(sub.root, '', routes, [])
    for (const { method, path, handler, middlewares } of routes) {
      this._routeImpl(method, base + path, [...allExtra, ...middlewares, handler])
    }

    const wsRoutes: Array<{ path: string; handler: WebSocketHandler; middlewares: Middleware[] }> = []
    this._collectWs(sub.wsRoot, '', wsRoutes)
    for (const { path, handler, middlewares } of wsRoutes) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this.ws(base + path, ...(allExtra as Middleware<any, any>[]), ...(middlewares as Middleware<any, any>[]), handler)
    }
  }

  private mergeMws(base: Middleware[], extra: Middleware[]): Middleware[] {
    if (base.length === 0) return extra.length === 0 ? base : extra
    if (extra.length === 0) return base
    return [...base, ...extra]
  }

  private _collect(
    node: TrieNode,
    prefix: string,
    result: Array<{ method: string; path: string; handler: Handler; middlewares: Middleware[] }>,
    pathMwsAcc: Middleware[],
  ): void {
    const mws = this.mergeMws(pathMwsAcc, node.pathMws)
    for (const [method, handler] of node.handlers) {
      const rmws = node.middlewares.get(method) || []
      const suffix = node.wildcard ? '/*' : ''
      result.push({ method, path: (prefix || '/') + suffix, handler, middlewares: this.mergeMws(mws, rmws) })
    }
    for (const [seg, child] of node.children) {
      const next = seg === ':' ? `/:${child.param}` : `/${seg}`
      this._collect(child, prefix + next, result, mws)
    }
  }

  private _collectWs(
    node: WsTrieNode,
    prefix: string,
    result: Array<{ path: string; handler: WebSocketHandler; middlewares: Middleware[] }>,
    pathMwsAcc: Middleware[] = [],
  ): void {
    const mws = this.mergeMws(pathMwsAcc, node.middlewares)
    if (node.handler) result.push({ path: prefix || '/', handler: node.handler, middlewares: mws })
    for (const [seg, child] of node.children) {
      const next = seg === ':' ? `/:${child.param}` : `/${seg}`
      this._collectWs(child, prefix + next, result, mws)
    }
  }

  private splitPath(path: string): string[] {
    return path.split('/').filter(Boolean)
  }

  private matchTrie(
    method: string,
    segments: string[],
  ): {
    handler?: Handler
    middlewares: Middleware[]
    pathMws: Middleware[]
    params: Record<string, string>
    allowedMethods?: string[]
  } | null {
    let node = this.root
    const params: Record<string, string> = {}
    const pathMws: Middleware[] = []
    let wildcardHandler: Handler | null = null
    let wildcardMws: Middleware[] = []
    let wildcardIdx = -1

    for (let i = 0; i < segments.length; i++) {
      pathMws.push(...node.pathMws)

      if (this._hasWildcard && node.wildcard) {
        const h = node.handlers.get('*') || node.handlers.get(method)
        if (h) {
          wildcardHandler = h
          wildcardMws = node.middlewares.get(method) || node.middlewares.get('*') || []
          wildcardIdx = i
        }
      }

      const segment = segments[i]

      const next = matchChild(node, segment, params, false)
      if (!next) {
        if (wildcardHandler) {
          params['*'] = segments.slice(wildcardIdx).join('/')
          return { handler: wildcardHandler, middlewares: wildcardMws, pathMws, params }
        }
        return null
      }
      node = next
    }

    pathMws.push(...node.pathMws)

    const handler = node.handlers.get(method) || node.handlers.get('*')
    if (handler) {
      if (node.wildcard) params['*'] = segments.slice(segments.length).join('/')
      return {
        handler,
        middlewares: node.middlewares.get(method) || node.middlewares.get('*') || [],
        pathMws,
        params,
      }
    }

    if (wildcardHandler) {
      params['*'] = segments.slice(wildcardIdx).join('/')
      return { handler: wildcardHandler, middlewares: wildcardMws, pathMws, params }
    }

    if (node.handlers.size > 0) {
      return { middlewares: [], pathMws, params, allowedMethods: [...node.handlers.keys()].filter(k => k !== '*') }
    }

    return null
  }

  private matchWsTrie(root: WsTrieNode, segments: string[]): WsMatchResult {
    let node = root
    const params: Record<string, string> = {}

    for (const segment of segments) {
      const next = matchChild(node, segment, params, true)
      if (!next) return null
      node = next
    }

    return node.handler
      ? { handler: node.handler, middlewares: node.middlewares, params }
      : null
  }

  private async handleError(e: unknown, req: Request, ctx: Context): Promise<Response> {
    const err = e instanceof Error ? e : new Error(String(e))
    console.error(err)
    return this.errorHandler
      ? await this.errorHandler(err, req, ctx as T)
      : new Response('Internal Server Error', { status: 500 })
  }

  private async handle(
    req: Request,
    ctx: Context,
    segments: string[],
  ): Promise<Response> {
    const match = this.matchTrie(req.method, segments)

    if (match) {
      Object.assign(ctx.params, match.params)

      if (match.handler) {
        const { handler, middlewares: routeMws, pathMws } = match
        const mws = this.mergeMws(this.mergeMws(this.globalMws, pathMws), routeMws)
        try {
          return await this.runChain(mws, handler, req, ctx)
        } catch (e) {
          return this.handleError(e, req, ctx)
        }
      }

      if (match.allowedMethods && match.allowedMethods.length > 0) {
        if (this.globalMws.length > 0) {
          try {
            return await this.runChain(this.globalMws, () => new Response('Method Not Allowed', {
              status: 405,
              headers: { 'Allow': match.allowedMethods!.join(', ') },
            }), req, ctx)
          } catch (e) {
            return this.handleError(e, req, ctx)
          }
        }
        return new Response('Method Not Allowed', {
          status: 405,
          headers: { 'Allow': match.allowedMethods.join(', ') },
        })
      }
    }

    if (this.globalMws.length > 0) {
      try {
        return await this.runChain(this.globalMws, () => {
          if (!isProd()) {
            return Response.json({ error: 'Not Found', path: '/' + (segments.join('/')), method: req.method }, { status: 404 })
          }
          return new Response('Not Found', { status: 404 })
        }, req, ctx)
      } catch (e) {
        return this.handleError(e, req, ctx)
      }
    }

    if (!isProd()) {
      return Response.json({
        error: 'Not Found',
        path: '/' + (segments.join('/')),
        method: req.method,
      }, { status: 404 })
    }
    return new Response('Not Found', { status: 404 })
  }

  private async runChain(
    middlewares: Middleware[],
    finalHandler: Handler,
    req: Request,
    ctx: Context,
  ): Promise<Response> {
    if (middlewares.length === 0) return await finalHandler(req, ctx)
    return await runChainLoop(middlewares, 0, finalHandler, req, ctx)
  }
}

function runChainLoop(
  middlewares: Middleware[],
  index: number,
  finalHandler: Handler,
  req: Request,
  ctx: Context,
): Promise<Response> {
  if (index < middlewares.length) {
    const mw = middlewares[index]
    let called = false
    const dispatch: Handler = (r, c) => {
      if (called) {
        console.warn('[router] next() called more than once in middleware — ignoring duplicate call')
        return Promise.resolve(new Response('Internal Server Error', { status: 500 }))
      }
      called = true
      return runChainLoop(middlewares, index + 1, finalHandler, r, c)
    }
    return Promise.resolve(mw(req, ctx, dispatch as unknown as Parameters<typeof mw>[2]))
  }
  return Promise.resolve(finalHandler(req, ctx))
}

function upgradeSocket(
  wss: WebSocketServer,
  req: IncomingMessage,
  socket: Duplex,
  head: Buffer,
  handler: WebSocketHandler,
  ctx: Context,
  hub: Hub,
): void {
  wss.handleUpgrade(req, socket, head, (ws) => {
    // ── Per-connection ctx — cloned from upgrade ctx ─────────
    // Each connection gets its own ctx, inheriting params/query/user/etc.
    const connCtx: Context = { ...ctx, params: { ...ctx.params }, query: { ...ctx.query } }

    // ── ctx.ws — per-connection WS helpers ───────────────────
    const wsState: Record<string, unknown> = {}
    connCtx.ws = {
      get state() { return wsState },
      json(data: unknown) { ws.send(JSON.stringify(data)) },
      join(room: string) { hub.join(room, ws) },
      leave(room: string) { hub.leave(ws) },
      sendRoom(room: string, data: unknown) { hub.broadcast(room, JSON.stringify(data)) },
    }

    if (handler.open) {
      handler.open(ws, connCtx)
    }

    ws.on('message', (data) => {
      handler.message?.(ws, connCtx, data as string | Buffer)
    })

    ws.on('close', () => {
      hub.leave(ws)
      handler.close?.(ws, connCtx)
    })

    ws.on('error', (err) => {
      handler.error?.(ws, connCtx, err)
    })
  })
}

function nodeReqHeadersToRecord(headers: http.IncomingHttpHeaders): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [k, v] of Object.entries(headers)) {
    if (v !== undefined) result[k] = Array.isArray(v) ? v.join(', ') : v
  }
  return result
}

function sendHttpResponseOnSocket(socket: Duplex, response: Response): void {
  const statusLine = `HTTP/1.1 ${response.status} ${response.statusText}`
  const headerLines: string[] = [statusLine]
  response.headers.forEach((value, key) => {
    headerLines.push(`${key}: ${value}`)
  })
  headerLines.push('Connection: close')
  headerLines.push('')
  const headerStr = headerLines.join('\r\n')

  response.arrayBuffer().then((buf) => {
    socket.write(headerStr + '\r\n')
    if (buf.byteLength > 0) socket.write(Buffer.from(buf))
    socket.end()
  }).catch(() => {
    socket.write(headerStr + '\r\n')
    socket.end()
  })
}
