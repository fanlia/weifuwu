/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import type { Context, Middleware } from './types.ts'
import { getCookies, setCookie } from './cookie.ts'

// Augment Context with csrf property
declare module './types.ts' {
  interface Context {
    csrf: CsrfInjected
  }
}

export interface CsrfInjected {
  token: string
}

/** Options for {@link csrf}. */
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
 *
 * ```ts
 * import { csrf } from 'weifuwu'
 * app.use(csrf())
 *
 * // In a form:
 * app.get('/form', (req, ctx) => {
 *   return new Response(`
 *     <form method="POST">
 *       <input type="hidden" name="_csrf" value="${ctx.csrf.token}" />
 *       <input type="submit" />
 *     </form>
 *   `, { headers: { 'content-type': 'text/html' } })
 * })
 * ```
 */
export function csrf(options?: CsrfOptions): Middleware<Context, Context & CsrfInjected> {
  const cookieName = options?.cookie ?? '_csrf'
  const headerName = options?.header ?? 'x-csrf-token'
  const bodyKey = options?.key ?? '_csrf'
  const excluded = new Set(options?.excludeMethods ?? ['GET', 'HEAD', 'OPTIONS'])

  const mw: Middleware<Context, Context & CsrfInjected> = async (req, ctx, next) => {
    const method = req.method.toUpperCase()

    if (excluded.has(method)) {
      let token = getCookies(req)[cookieName]
      if (!token) {
        token = crypto.randomUUID()
        ;(ctx as any).csrf = { token }
      } else {
        ;(ctx as any).csrf = { token }
      }

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
    // Fallback: try to extract from request body
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
      } catch (e) {
        return new Response('Invalid request body', { status: 400 })
      }
    }

    if (!cookieToken || !headerToken || cookieToken !== headerToken) {
      return new Response('CSRF token mismatch', { status: 403 })
    }

    return next(req, ctx as Context & CsrfInjected)
  }
  ;(mw as any).__meta = { injects: ['csrf'], depends: [] }
  return mw
}
