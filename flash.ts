import type { Middleware } from './types.ts'
import { getCookies } from './cookie.ts'

export interface FlashOptions {
  /** Cookie name (default: 'flash'). */
  name?: string
}

/**
 * Flash message middleware.
 *
 * Reads a `flash` cookie on each request and makes it available at `ctx.parsed.flash`.
 * Automatically clears the cookie after reading so it's only shown once.
 *
 * ```ts
 * app.use(flash())
 *
 * // Handler — read flash
 * app.get('/', (req, ctx) => {
 *   const msg = ctx.parsed?.flash  // { type: 'success', text: 'Saved!' }
 * })
 *
 * // Set flash — return a response with Set-Cookie
 * app.post('/save', () => {
 *   return new Response('OK', {
 *     headers: { 'Set-Cookie': 'flash=%7B%22type%22%3A%22success%22%7D; Path=/; SameSite=Lax' },
 *   })
 * })
 * ```
 */
export function flash(options?: FlashOptions): Middleware {
  const name = options?.name ?? 'flash'

  return async (req, ctx, next) => {
    const raw = getCookies(req)[name] ?? null

    if (raw) {
      try {
        ;(ctx as any).parsed = { ...(ctx as any).parsed, flash: JSON.parse(decodeURIComponent(raw)) }
      } catch {
        ;(ctx as any).parsed = { ...(ctx as any).parsed, flash: raw }
      }
    }

    const res = await next(req, ctx)

    if (raw) {
      // Clear the flash cookie after reading (one-time display)
      const headers = new Headers(res.headers)
      headers.append('Set-Cookie', `${name}=; Path=/; Max-Age=0`)
      return new Response(res.body, { status: res.status, statusText: res.statusText, headers })
    }

    return res
  }
}
