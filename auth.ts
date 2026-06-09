import type { Middleware } from './types.ts'

export interface AuthOptions {
  token?: string
  verify?: (token: string, req: Request) => unknown | Promise<unknown>
  proxy?: string | URL
  header?: string
}

export function auth(options: AuthOptions): Middleware {
  if (!options.token && !options.verify && !options.proxy) {
    throw new Error('auth() requires at least one of: token, verify, or proxy')
  }

  return async (req, ctx, next) => {
    const headerName = options.header ?? 'Authorization'
    let from = 'header'
    let header = req.headers.get(headerName)

    let token = ''
    if (header) {
      token = header.trim()
      if (headerName.toLowerCase() === 'authorization') {
        const parts = header.split(' ')
        if (parts[0]?.toLowerCase() === 'bearer') {
          token = parts.slice(1).join(' ').trim()
        }
      }
    } else if (!options.header) {
      const url = new URL(req.url)
      const qsToken = url.searchParams.get('access_token')
      if (qsToken) {
        token = qsToken
        from = 'query'
      }
    }

    if (!token) {
      return new Response('Unauthorized', {
        status: 401,
        headers: headerName.toLowerCase() === 'authorization'
          ? { 'WWW-Authenticate': 'Bearer' }
          : undefined,
      })
    }

    if (options.proxy) {
      let proxyUrl: URL
      try {
        proxyUrl = typeof options.proxy === 'string'
          ? new URL(options.proxy)
          : options.proxy
      } catch {
        return new Response('Invalid proxy URL', { status: 500 })
      }

      const proxyHeaders: Record<string, string> = {}

      if (from === 'header' && header) {
        proxyHeaders[headerName] = header
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

    if (options.token) {
      if (token !== options.token) {
        return new Response('Forbidden', { status: 403 })
      }
      return next(req, ctx)
    }

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

    return next(req, ctx)
  }
}
