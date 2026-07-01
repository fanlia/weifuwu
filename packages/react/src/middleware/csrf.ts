/* eslint-disable @typescript-eslint/no-explicit-any */
import { getCookies, setCookie, type Context, type Middleware } from '@weifuwujs/core'
// Augment Context with csrf property
declare module '@weifuwujs/core' {
  interface Context {
    csrf: CsrfInjected
  }
}

export interface CsrfInjected {
  token: string
}

/** CSRF protection module — a {@link Middleware} that injects `ctx.csrf`. */
export type CsrfModule = Middleware<Context, Context & CsrfInjected>

export interface CsrfOptions {
  /** Cookie name for CSRF token (default: `'_csrf'`). */
  cookie?: string
  /** Request header name for CSRF token (default: `'x-csrf-token'`). */
  header?: string
  /** Form body key for CSRF token (default: `'_csrf'`). */
  key?: string
  /** HTTP methods to exclude from CSRF protection (default: `['GET', 'HEAD', 'OPTIONS']`). */
  excludeMethods?: string[]
}

/**
 * CSRF protection middleware.
 *
 * On excluded methods (GET, HEAD, OPTIONS), generates a token and stores it
 * in a cookie. On other methods, validates the token from header or body
 * against the cookie.
 *
 * Injects `ctx.csrf.token` for use in forms.
 */
export function csrf(options?: CsrfOptions): Middleware<Context, Context & CsrfInjected> {
  const cookieName = options?.cookie ?? '_csrf'
  const headerName = options?.header ?? 'x-csrf-token'
  const bodyKey = options?.key ?? '_csrf'
  const excluded = new Set(options?.excludeMethods ?? ['GET', 'HEAD', 'OPTIONS'])

  const mw: Middleware<Context, Context & CsrfInjected> = async (req, ctx, next) => {
    const method = req.method.toUpperCase()

    if (excluded.has(method)) {
      const token = getCookies(req)[cookieName] || crypto.randomUUID()
      ;(ctx as any).csrf = { token }
      const res = await next(req, ctx as Context & CsrfInjected)
      const tokenToSet = (ctx as any).csrf?.token
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

    if (
      !headerToken &&
      (req.method === 'POST' ||
        req.method === 'PUT' ||
        req.method === 'PATCH' ||
        req.method === 'DELETE')
    ) {
      try {
        const body = await req.clone().json()
        headerToken = body[bodyKey] ?? ''
      } catch {
        return new Response('Invalid request body', { status: 400 })
      }
    }

    if (!cookieToken || !headerToken || cookieToken !== headerToken) {
      return new Response('CSRF token mismatch', { status: 403 })
    }

    return next(req, ctx as Context & CsrfInjected)
  }
  mw.__meta = { injects: ['csrf'], depends: [] }
  return mw
}
