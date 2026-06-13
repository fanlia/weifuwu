import type { Middleware } from './types.ts'
import { getCookies } from './cookie.ts'

export interface FlashOptions {
  /** Cookie name (default: 'flash'). */
  name?: string
}

function makeSetFlash(name: string, location: string) {
  return (data: unknown, loc?: string) => {
    const finalLoc = loc ?? location
    const value = encodeURIComponent(JSON.stringify(data))
    return new Response(null, {
      status: 302,
      headers: {
        Location: finalLoc,
        'Set-Cookie': `${name}=${value}; Path=/; SameSite=Lax`,
      },
    })
  }
}

/**
 * Flash message middleware.
 *
 * ```ts
 * app.use(flash())
 *
 * // Read flash
 * app.get('/', (req, ctx) => {
 *   const msg = ctx.flash.value  // { type: 'success', text: 'Saved!' }
 * })
 *
 * // Set flash + redirect
 * app.post('/save', async (req, ctx) => {
 *   await save()
 *   return ctx.flash.set({ type: 'success', text: 'Saved!' }, '/articles')
 * })
 * ```
 */
export function flash(options?: FlashOptions): Middleware {
  const name = options?.name ?? 'flash'

  return async (req, ctx, next) => {
    const raw = getCookies(req)[name] ?? null
    const referer = req.headers.get('referer') || '/'

    let value: unknown = undefined
    if (raw) {
      try { value = JSON.parse(decodeURIComponent(raw)) } catch { value = raw }
    }

    ;(ctx as any).flash = {
      value,
      set: makeSetFlash(name, referer),
    }

    const res = await next(req, ctx)

    if (raw) {
      const headers = new Headers(res.headers)
      headers.append('Set-Cookie', `${name}=; Path=/; Max-Age=0`)
      return new Response(res.body, { status: res.status, statusText: res.statusText, headers })
    }

    return res
  }
}
