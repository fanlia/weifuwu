import { WebSocketServer } from 'ws'
import type { WebSocket } from './vendor.ts'
import type { IncomingMessage } from 'node:http'
import type { Duplex } from 'node:stream'
import type { Context, Handler, Middleware, ErrorHandler } from './types.ts'

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

const getTrieNode = (node: TrieNode, segment: string): TrieNode => {
  if (segment.startsWith(':')) {
    if (!node.children.has(':')) {
      const child = createTrieNode()
      child.param = segment.slice(1)
      node.children.set(':', child)
    }
    const child = node.children.get(':')!
    if (child.param !== segment.slice(1)) {
      throw new Error(
        `Param name conflict: ":${child.param}" already registered at this path position, cannot register ":"${segment.slice(1)}"`,
      )
    }
    return child
  }
  if (!node.children.has(segment)) {
    node.children.set(segment, createTrieNode())
  }
  return node.children.get(segment)!
}

const matchTrieNode = (
  node: TrieNode,
  segment: string,
  params: Record<string, string>,
): TrieNode | null => {
  if (node.children.has(segment)) return node.children.get(segment)!
  if (node.children.has(':')) {
    const child = node.children.get(':')!
    if (child.param) params[child.param] = segment
    return child
  }
  return null
}

const getWsNode = (node: WsTrieNode, segment: string): WsTrieNode => {
  if (segment === '*') {
    node.wildcard = true
    return node
  }
  if (segment.startsWith(':')) {
    if (!node.children.has(':')) {
      const child = createWsNode()
      child.param = segment.slice(1)
      node.children.set(':', child)
    }
    const child = node.children.get(':')!
    if (child.param !== segment.slice(1)) {
      throw new Error(
        `Param name conflict: ":${child.param}" already registered at this path position`,
      )
    }
    return child
  }
  if (!node.children.has(segment)) {
    node.children.set(segment, createWsNode())
  }
  return node.children.get(segment)!
}

const matchWsNode = (
  node: WsTrieNode,
  segment: string,
  params: Record<string, string>,
): WsTrieNode | null => {
  if (node.children.has(segment)) return node.children.get(segment)!
  if (node.children.has(':')) {
    const child = node.children.get(':')!
    if (child.param) params[child.param] = segment
    return child
  }
  if (node.wildcard) return node
  return null
}

type WsMatchResult = {
  handler: WebSocketHandler
  middlewares: Middleware[]
  params: Record<string, string>
} | null

type WsUpgradeHandler = (req: IncomingMessage, socket: Duplex, head: Buffer) => void

export class Router {
  private root: TrieNode = createTrieNode()
  private wsRoot: WsTrieNode = createWsNode()
  private globalMws: Middleware[] = []
  private errorHandler?: ErrorHandler
  private wss = new WebSocketServer({ noServer: true })

  use(mw: Middleware): this
  use(router: Router): this
  use(path: string, router: Router): this
  use(path: string, mw: Middleware): this
  use(arg1: string | Middleware | Router, arg2?: Router | Middleware): this {
    if (typeof arg1 === 'string') {
      if (arg2 instanceof Router) {
        this._mountRouter(arg1, arg2)
      } else if (typeof arg2 === 'function') {
        let node = this.root
        for (const segment of this.splitPath(arg1)) {
          node = getTrieNode(node, segment)
        }
        node.pathMws.push(arg2)
      }
    } else if (arg1 instanceof Router) {
      this._mountRouter('/', arg1)
    } else if (typeof arg1 === 'function') {
      this.globalMws.push(arg1)
    }
    return this
  }

  get(path: string, ...args: [...Middleware[], Handler | Router]): this {
    return this.route('GET', path, ...args)
  }

  post(path: string, ...args: [...Middleware[], Handler | Router]): this {
    return this.route('POST', path, ...args)
  }

  put(path: string, ...args: [...Middleware[], Handler | Router]): this {
    return this.route('PUT', path, ...args)
  }

  delete(path: string, ...args: [...Middleware[], Handler | Router]): this {
    return this.route('DELETE', path, ...args)
  }

  patch(path: string, ...args: [...Middleware[], Handler | Router]): this {
    return this.route('PATCH', path, ...args)
  }

  head(path: string, ...args: [...Middleware[], Handler | Router]): this {
    return this.route('HEAD', path, ...args)
  }

  options(path: string, ...args: [...Middleware[], Handler | Router]): this {
    return this.route('OPTIONS', path, ...args)
  }

  all(path: string, ...args: [...Middleware[], Handler | Router]): this {
    return this.route('*', path, ...args)
  }

  onError(handler: ErrorHandler): this {
    this.errorHandler = handler
    return this
  }

  route(method: string, path: string, ...args: [...Middleware[], Handler | Router]): this {
    const last = args[args.length - 1]
    if (last instanceof Router) {
      this._mountRouter(path, last)
      return this
    }
    const handler = args.pop()! as Handler
    const middlewares = args as Middleware[]
    const segments = this.splitPath(path)
    let node = this.root

    for (const segment of segments) {
      if (segment === '*') {
        const remaining = segments.indexOf('*') < segments.length - 1
        if (remaining) {
          console.warn(`Route "${path}": segments after "*" are ignored`)
        }
        node.wildcard = true
        node.handlers.set(method, handler)
        if (middlewares.length > 0) node.middlewares.set(method, middlewares)
        return this
      }
      node = getTrieNode(node, segment)
    }

    node.handlers.set(method, handler)
    if (middlewares.length > 0) node.middlewares.set(method, middlewares)
    return this
  }

  ws(path: string, ...args: [...Middleware[], WebSocketHandler]): this {
    const handler = args.pop()! as WebSocketHandler
    const middlewares = args as Middleware[]
    const segments = this.splitPath(path)
    let node = this.wsRoot

    for (const segment of segments) {
      node = getWsNode(node, segment)
    }

    node.handler = handler
    if (middlewares.length > 0) node.middlewares = middlewares
    return this
  }



  handler(): Handler {
    return (req, ctx) => {
      const url = new URL(req.url)
      return this.handle(req, ctx, this.splitPath(url.pathname), Object.fromEntries(url.searchParams))
    }
  }

  websocketHandler(): WsUpgradeHandler {
    const wsRoot = this.wsRoot
    const router = this

    return (req, socket, head) => {
      const url = new URL(req.url ?? '/', 'http://localhost')
      const segments = url.pathname.split('/').filter(Boolean)

      const match = router.matchWsTrie(wsRoot, segments)
      if (match) {
        const query = Object.fromEntries(url.searchParams)
        const webReq = new Request(url.href, {
          method: req.method ?? 'GET',
          headers: Object.fromEntries(
            Object.entries(req.headers).map(([k, v]) => [k, Array.isArray(v) ? v.join(', ') : v ?? '']),
          ),
        })
        const ctx = { params: match.params, query } as Context

        if (match.middlewares.length === 0) {
          upgradeSocket(router.wss, req, socket, head, match.handler, ctx)
          return
        }

        let index = 0
        const dispatch: Handler = async (innerReq, ctx) => {
          if (index < match.middlewares.length) {
            const mw = match.middlewares[index++]
            return mw!(innerReq, ctx, dispatch)
          }
          return await new Promise<Response>((resolve) => {
            try {
              upgradeSocket(router.wss, req, socket, head, match.handler, ctx)
              resolve(new Response(null, { status: 101 }))
            } catch {
              socket.destroy()
              resolve(new Response('WebSocket upgrade failed', { status: 500 }))
            }
          })
        }

        Promise.resolve(dispatch(webReq, ctx)).then((result) => {
          if (result.status !== 101) {
            sendHttpResponseOnSocket(socket, result)
          }
        }).catch(() => {
          socket.destroy()
        })
        return
      }

      socket.destroy()
    }
  }

  private _mountRouter(prefix: string, sub: Router): void {
    const base = prefix === '/' ? '' : prefix.replace(/\/$/, '')

    const mountMw: Middleware = (req, ctx, next) => {
      ctx.mountPath = (ctx.mountPath || '') + base
      return next(req, ctx)
    }

    // Merge sub-router's global middleware into parent so they run on ALL routes
    this.globalMws.push(...sub.globalMws)

    const routes: Array<{ method: string; path: string; handler: Handler; middlewares: Middleware[] }> = []
    this._collect(sub.root, '', routes, [])
    for (const { method, path, handler, middlewares } of routes) {
      this.route(method, base + path, mountMw, ...sub.globalMws, ...middlewares, handler)
    }

    const wsRoutes: Array<{ path: string; handler: WebSocketHandler }> = []
    this._collectWs(sub.wsRoot, '', wsRoutes)
    for (const { path, handler } of wsRoutes) {
      this.ws(base + path, handler)
    }
  }

  private _collect(
    node: TrieNode,
    prefix: string,
    result: Array<{ method: string; path: string; handler: Handler; middlewares: Middleware[] }>,
    pathMwsAcc: Middleware[],
  ): void {
    const mws = [...pathMwsAcc, ...node.pathMws]
    if (node.wildcard) {
      for (const [method, handler] of node.handlers) {
        result.push({ method, path: prefix + '/*', handler, middlewares: [...mws, ...(node.middlewares.get(method) || [])] })
      }
    } else {
      for (const [method, handler] of node.handlers) {
        result.push({ method, path: prefix || '/', handler, middlewares: [...mws, ...(node.middlewares.get(method) || [])] })
      }
    }
    for (const [seg, child] of node.children) {
      if (seg === ':') this._collect(child, prefix + '/:' + child.param, result, mws)
      else this._collect(child, prefix + '/' + seg, result, mws)
    }
  }

  private _collectWs(
    node: WsTrieNode,
    prefix: string,
    result: Array<{ path: string; handler: WebSocketHandler }>,
  ): void {
    if (node.handler) result.push({ path: prefix || '/', handler: node.handler })
    for (const [seg, child] of node.children) {
      if (seg === ':') this._collectWs(child, prefix + '/:' + child.param, result)
      else this._collectWs(child, prefix + '/' + seg, result)
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
  } | null {
    let node = this.root
    const params: Record<string, string> = {}
    const pathMws: Middleware[] = []
    let wildcardHandler: Handler | null = null
    let wildcardMws: Middleware[] = []
    let wildcardIdx = -1

    for (let i = 0; i < segments.length; i++) {
      pathMws.push(...node.pathMws)

      if (node.wildcard) {
        const h = node.handlers.get('*') || node.handlers.get(method)
        if (h) {
          wildcardHandler = h
          wildcardMws = node.middlewares.get(method) || node.middlewares.get('*') || []
          wildcardIdx = i
        }
      }

      const segment = segments[i]
      if (!segment) break

      const next = matchTrieNode(node, segment, params)
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
    return null
  }

  private matchWsTrie(root: WsTrieNode, segments: string[]): WsMatchResult {
    let node = root
    const params: Record<string, string> = {}

    for (const segment of segments) {
      const next = matchWsNode(node, segment, params)
      if (!next) return null
      node = next
    }

    return node.handler
      ? { handler: node.handler, middlewares: node.middlewares, params }
      : null
  }

  private async handle(
    req: Request,
    ctx: Context,
    segments: string[],
    query: Record<string, string>,
  ): Promise<Response> {
    const match = this.matchTrie(req.method, segments)

    if (match?.handler) {
      const { handler, middlewares: routeMws, pathMws, params } = match
      const allMws = this.globalMws.length + pathMws.length + routeMws.length === 0
        ? [] as Middleware[]
        : [...this.globalMws, ...pathMws, ...routeMws]
      const ctxWithMatch = { ...ctx, params: { ...ctx.params, ...params } }

      try {
        return await this.runChain(allMws, handler, req, ctxWithMatch)
      } catch (e) {
        const err = e instanceof Error ? e : new Error(String(e))
        console.error(err)
        return this.errorHandler
          ? this.errorHandler(err, req, ctxWithMatch)
          : new Response('Internal Server Error', { status: 500 })
      }
    }

    if (this.globalMws.length > 0) {
      try {
        const delegate: Handler = () => new Response('Not Found', { status: 404 })
        return await this.runChain(this.globalMws, delegate, req, ctx)
      } catch (e) {
        const err = e instanceof Error ? e : new Error(String(e))
        console.error(err)
        return this.errorHandler
          ? this.errorHandler(err, req, ctx)
          : new Response('Internal Server Error', { status: 500 })
      }
    }

    return new Response('Not Found', { status: 404 })
  }

  private async runChain(
    middlewares: Middleware[],
    finalHandler: Handler,
    req: Request,
    ctx: Context,
  ): Promise<Response> {
    let index = 0
    const dispatch: Handler = async (req, ctx) => {
      if (index < middlewares.length) {
        const mw = middlewares[index++]
        return mw
          ? await mw(req, ctx, dispatch)
          : new Response('Middleware error', { status: 500 })
      }
      return await finalHandler(req, ctx)
    }
    return dispatch(req, ctx)
  }
}

function upgradeSocket(
  wss: WebSocketServer,
  req: IncomingMessage,
  socket: Duplex,
  head: Buffer,
  handler: WebSocketHandler,
  ctx: Context,
): void {
  wss.handleUpgrade(req, socket, head, (ws) => {
    if (handler.open) {
      handler.open(ws, ctx)
    }

    ws.on('message', (data) => {
      handler.message?.(ws, ctx, data as string | Buffer)
    })

    ws.on('close', () => {
      handler.close?.(ws, ctx)
    })

    ws.on('error', (err) => {
      handler.error?.(ws, ctx, err)
    })
  })
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
    const body = Buffer.from(buf)
    socket.write(headerStr + '\r\n' + body.toString())
    socket.end()
  }).catch(() => {
    socket.write(headerStr + '\r\n')
    socket.end()
  })
}




