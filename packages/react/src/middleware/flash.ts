/**
 * Flash message middleware.
 *
 * Provides a cookie-based flash message system:
 * - Read: `ctx.flash.value` parses the incoming flash cookie
 * - Write: `ctx.flash.set(data, location)` sets a new flash and redirects
 * - Auto-clear: after reading, the flash cookie is cleared from the response
 *
 * ```ts
 * import { flash } from 'weifuwu'
 *
 * app.use(flash())
 *
 * // Read flash
 * app.get('/', (req, ctx) => {
 *   const msg = ctx.flash.value  // e.g. { type: 'success', text: 'Saved!' }
 * })
 *
 * // Set flash + redirect
 * app.post('/save', async (req, ctx) => {
 *   await save()
 *   return ctx.flash.set({ type: 'success', text: 'Saved!' }, '/articles')
 * })
 * ```
 */
import { getCookies, type Context, type Middleware } from '@weifuwujs/core'
// Augment Context with flash property
declare module '@weifuwujs/core' {
  interface Context {
    flash: FlashInjected
  }
}

/** Flash message module — a {@link Middleware} that injects `ctx.flash`. */
export type FlashModule = Middleware<Context, Context & FlashInjected>

/** Options for {@link flash}. */
export interface FlashOptions {
  /**
   * Cookie name to store the flash message.
   * @default 'flash'
   */
  name?: string
}

/**
 * Flash message object injected into `ctx.flash`.
 */
export interface FlashInjected {
  /**
   * The flash value read from the incoming cookie.
   * `undefined` if no flash cookie is present.
   * Automatically cleared after the response is sent.
   */
  value: unknown
  /**
   * Set a flash message and return a 302 redirect response.
   *
   * @param data - Any JSON-serializable value to store as the flash message.
   * @param location - Redirect location (defaults to the `Referer` header).
   * @returns A 302 Response with a `Set-Cookie` header.
   */
  set: (data: unknown, location?: string) => Response
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
 * Flash message middleware — injects `ctx.flash`.
 *
 * @param options - Cookie name configuration.
 * @returns Middleware that injects `ctx.flash` (`FlashInjected`).
 */
export function flash(
  options?: FlashOptions,
): Middleware<Context, Context & { flash: FlashInjected }> {
  const name = options?.name ?? 'flash'

  const mw: Middleware<Context, Context & { flash: FlashInjected }> = async (req, ctx, next) => {
    const raw = getCookies(req)[name] ?? null
    const referer = req.headers.get('referer') || '/'

    let value: unknown = undefined
    if (raw) {
      try {
        value = JSON.parse(decodeURIComponent(raw))
      } catch {
        value = raw
      }
    }

    ctx.flash = {
      value,
      set: makeSetFlash(name, referer),
    } as FlashInjected

    const res = await next(req, ctx as Context & { flash: FlashInjected })

    if (raw) {
      const headers = new Headers(res.headers)
      headers.append('Set-Cookie', `${name}=; Path=/; Max-Age=0`)
      return new Response(res.body, { status: res.status, statusText: res.statusText, headers })
    }

    return res
  }
  mw.__meta = { injects: ['flash'], depends: [] }
  return mw
}
