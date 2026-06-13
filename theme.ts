import type { Context, Middleware } from './types.ts'
import { getCookies } from './cookie.ts'

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

export function theme(options?: ThemeOptions): Middleware {
  const opts = { default: 'system', cookie: 'theme', ...options }

  return async (req, ctx, next) => {
    const url = new URL(req.url)
    const match = url.pathname.match(/^\/__theme\/([\w-]+)$/)

    if (match && req.method === 'GET') {
      const value = match[1]
      const cookie = `${opts.cookie}=${encodeURIComponent(value)}; Path=/; SameSite=Lax`
      const accept = req.headers.get('accept') ?? ''
      if (accept.includes('application/json')) {
        return Response.json({ ok: true, theme: value }, { headers: { 'Set-Cookie': cookie } })
      }
      const referer = req.headers.get('referer') || '/'
      return new Response(null, { status: 302, headers: { Location: referer, 'Set-Cookie': cookie } })
    }

    let themeValue = opts.default
    if (opts.cookie) {
      const fromCookie = getCookies(req)[opts.cookie]
      if (fromCookie) themeValue = fromCookie
    }

    ctx.theme = {
      value: themeValue,
      set: makeSetTheme(opts.cookie, req.headers.get('referer') || '/'),
    }
    return next(req, ctx)
  }
}
