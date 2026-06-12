import type { Context, Middleware } from './types.ts'
import { getCookies, setCookie } from './cookie.ts'

export interface CsrfOptions {
  cookie?: string
  header?: string
  key?: string
  excludeMethods?: string[]
}

export function csrf(options?: CsrfOptions): Middleware<Context, Context & { csrfToken: string }> {
  const cookieName = options?.cookie ?? '_csrf'
  const headerName = options?.header ?? 'x-csrf-token'
  const bodyKey = options?.key ?? '_csrf'
  const excluded = new Set(options?.excludeMethods ?? ['GET', 'HEAD', 'OPTIONS'])

  return async (req, ctx, next) => {
    const method = req.method.toUpperCase()

    if (excluded.has(method)) {
      let token = getCookies(req)[cookieName]
      if (!token) {
        token = crypto.randomUUID()
        ;(ctx as any).csrfToken = token
      } else {
        ;(ctx as any).csrfToken = token
      }

      const res = await next(req, ctx as Context & { csrfToken: string })
      const tokenToSet = (ctx as any).csrfToken
      if (tokenToSet && !getCookies(req)[cookieName]) {
        return setCookie(res, cookieName, tokenToSet, {
          httpOnly: true,
          sameSite: 'strict',
          path: '/',
        })
      }
      return res
    }

    const cookieToken = getCookies(req)[cookieName]

    let headerToken = req.headers.get(headerName) ?? ''
    // Fallback: try to extract from request body
    if (!headerToken && (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH' || req.method === 'DELETE')) {
      try {
        const body = await req.clone().json()
        headerToken = body[bodyKey] ?? ''
      } catch (e) {
        return new Response('Invalid request body', { status: 400 })
      }
    }

    if (!cookieToken || !headerToken || cookieToken !== headerToken) {
      return new Response('CSRF token mismatch', { status: 403 })
    }

    return next(req, ctx as Context & { csrfToken: string })
  }
}
