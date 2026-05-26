import type { Middleware } from './types.ts'

// ── Logger ────────────────────────────────────────────────────────────────────

export interface LoggerOptions {
  format?: 'short' | 'combined'
}

export function logger(options?: LoggerOptions): Middleware {
  return async (req, ctx, next) => {
    const start = Date.now()
    const url = new URL(req.url)
    const res = await next(req, ctx)
    const ms = Date.now() - start

    if (options?.format === 'combined') {
      console.log(`${req.method} ${url.pathname}${url.search} ${res.status} ${ms}ms`)
    } else {
      console.log(`${req.method} ${url.pathname} ${res.status} ${ms}ms`)
    }

    return res
  }
}

// ── CORS ──────────────────────────────────────────────────────────────────────

export interface CORSOptions {
  origin?: string | string[] | ((origin: string) => string | boolean | undefined)
  methods?: string[]
  allowedHeaders?: string[]
  exposedHeaders?: string[]
  credentials?: boolean
  maxAge?: number
}

export function cors(options?: CORSOptions): Middleware {
  const opts: Required<Pick<CORSOptions, 'origin' | 'methods' | 'allowedHeaders'>> & CORSOptions = {
    origin: '*',
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    ...options,
  }

  function resolveOrigin(requestOrigin: string): string {
    if (typeof opts.origin === 'string') return opts.origin === '*' ? '*' : opts.origin
    if (Array.isArray(opts.origin)) {
      return opts.origin.includes(requestOrigin) ? requestOrigin : ''
    }
    const result = opts.origin(requestOrigin)
    if (typeof result === 'boolean') return result ? requestOrigin : ''
    if (typeof result === 'string') return result
    return ''
  }

  function setCORSHeaders(res: Response, acao: string): Response {
    if (!acao) return res
    const headers = new Headers(res.headers)
    headers.set('Access-Control-Allow-Origin', acao)
    if (opts.credentials) headers.set('Access-Control-Allow-Credentials', 'true')
    if (opts.exposedHeaders?.length) headers.set('Access-Control-Expose-Headers', opts.exposedHeaders.join(', '))
    headers.set('Vary', 'Origin')
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers })
  }

  return (req, ctx, next) => {
    const requestOrigin = req.headers.get('origin') ?? ''
    const acao = resolveOrigin(requestOrigin)

    if (req.method === 'OPTIONS' && acao) {
      const headers = new Headers()
      headers.set('Access-Control-Allow-Origin', acao)
      headers.set('Access-Control-Allow-Methods', opts.methods.join(', '))
      headers.set('Access-Control-Allow-Headers', opts.allowedHeaders.join(', '))
      if (opts.credentials) headers.set('Access-Control-Allow-Credentials', 'true')
      if (opts.maxAge != null) headers.set('Access-Control-Max-Age', String(opts.maxAge))
      headers.set('Vary', 'Origin')
      return new Response(null, { status: 204, headers })
    }

    if (!acao) return next(req, ctx)

    return Promise.resolve(next(req, ctx)).then((res) => setCORSHeaders(res, acao))
  }
}

// ── Auth ───────────────────────────────────────────────────────────────────────

export interface AuthOptions {
  token?: string
  verify?: (token: string, req: Request) => unknown | Promise<unknown>
  proxy?: string | URL
  header?: string
}

export function auth(options: AuthOptions): Middleware {
  return async (req, ctx, next) => {
    const headerName = options.header ?? 'Authorization'
    const header = req.headers.get(headerName)

    if (!header) {
      return new Response('Unauthorized', {
        status: 401,
        headers: headerName.toLowerCase() === 'authorization'
          ? { 'WWW-Authenticate': 'Bearer' }
          : undefined,
      })
    }

    let token = header
    if (headerName.toLowerCase() === 'authorization') {
      const parts = header.split(' ')
      if (parts[0]?.toLowerCase() === 'bearer') {
        token = parts.slice(1).join(' ')
      }
    }

    // ── Proxy mode ──────────────────────────────────────────────────────────
    if (options.proxy) {
      const proxyUrl = typeof options.proxy === 'string'
        ? new URL(options.proxy)
        : options.proxy

      const proxyHeaders: Record<string, string> = {}

      if (headerName.toLowerCase() === 'authorization') {
        proxyHeaders['Authorization'] = header
      } else {
        proxyUrl.searchParams.set('access_token', token)
      }

      for (const name of ['x-forwarded-for', 'x-real-ip', 'user-agent', 'content-type']) {
        const v = req.headers.get(name)
        if (v) proxyHeaders[name] = v
      }

      const proxyRes = await fetch(proxyUrl.href, { headers: proxyHeaders })

      if (proxyRes.status >= 400) {
        return new Response(await proxyRes.text() || 'Forbidden', { status: proxyRes.status })
      }

      let userData: unknown = undefined
      if (proxyRes.status === 200) {
        const ct = proxyRes.headers.get('content-type')
        if (ct?.includes('application/json')) {
          try { userData = await proxyRes.json() } catch {}
        }
      }

      ctx.user = userData
      return next(req, ctx)
    }

    // ── Static token mode ───────────────────────────────────────────────────
    if (options.token) {
      if (token !== options.token) {
        return new Response('Forbidden', { status: 403 })
      }
      return next(req, ctx)
    }

    // ── Verify mode ─────────────────────────────────────────────────────────
    if (options.verify) {
      const result = await options.verify(token, req)
      if (!result) {
        return new Response('Forbidden', { status: 403 })
      }
      if (typeof result === 'object' && result !== null) {
        ctx.user = result
      }
      return next(req, ctx)
    }

    // ── Trust any token (no validation configured) ─────────────────────────
    return next(req, ctx)
  }
}
