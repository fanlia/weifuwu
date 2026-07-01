import { getCookies } from '../core/cookie.ts'
import { Router } from '../core/router.ts'
import type { Context, Middleware } from '../types.ts'
// Augment Context with theme property
declare module '../types.ts' {
  interface Context {
    theme: ThemeInjected
  }
}

export interface ThemeInjected {
  value: string
  set: (value: string, loc?: string) => Response
}

export interface ThemeOptions {
  /** Default theme value (default: 'system'). */
  default?: string
  /** Cookie name (default: 'theme'). Set to empty string to disable cookie. */
  cookie?: string
}

function makeSetTheme(cookie: string, location: string) {
  return (value: string, loc?: string) => {
    const finalLoc = loc ?? location
    const c = `${cookie}=${encodeURIComponent(value)}; Path=/; SameSite=Lax`
    return new Response(null, { status: 302, headers: { Location: finalLoc, 'Set-Cookie': c } })
  }
}

/**
 * Theme module. Returns a Router with an attached `.middleware()` method.
 *
 * ```ts
 * const t = theme()
 * app.use(t.middleware())  // → ctx.theme = { value, set }
 * app.use('/', t)          // → GET /__theme/dark (switch route)
 * ```
 */
export interface ThemeModule extends Router {
  /** Middleware that injects `ctx.theme = { value, set }`. */
  middleware: () => Middleware<Context, Context & ThemeInjected>
}

export function theme(options?: ThemeOptions): ThemeModule {
  const opts = { default: 'system', cookie: 'theme', ...options }

  const mw: Middleware<Context, Context & ThemeInjected> = async (req, ctx, next) => {
    let themeValue = opts.default
    if (opts.cookie) {
      const fromCookie = getCookies(req)[opts.cookie]
      if (fromCookie) themeValue = fromCookie
    }

    ;(ctx as Context & ThemeInjected).theme = {
      value: themeValue,
      set: makeSetTheme(opts.cookie, req.headers.get('referer') || '/'),
    }
    return next(req, ctx as Context & ThemeInjected)
  }
  mw.__meta = { injects: ['theme'], depends: [] }

  class ThemeRouter extends Router {
    middleware() {
      return mw
    }
  }

  const router = new ThemeRouter()
  router.get('/__theme/:value', (req) => {
    const url = new URL(req.url)
    const value = url.pathname.split('/__theme/')[1] ?? ''
    const cookie = `${opts.cookie}=${encodeURIComponent(value)}; Path=/; SameSite=Lax`
    const accept = req.headers.get('accept') ?? ''
    if (accept.includes('application/json')) {
      return Response.json({ ok: true, theme: value }, { headers: { 'Set-Cookie': cookie } })
    }
    const referer = req.headers.get('referer') || '/'
    return new Response(null, { status: 302, headers: { Location: referer, 'Set-Cookie': cookie } })
  })

  return router
}
