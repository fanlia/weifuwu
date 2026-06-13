import crypto from 'node:crypto'
import type { Context, Middleware } from './types.ts'

/** Options for {@link requestId}. */
export interface RequestIdOptions {
  /** Header name for request ID (default: `'X-Request-ID'`). */
  header?: string
  /** Custom ID generator (default: `crypto.randomUUID`). */
  generator?: () => string
}

/**
 * Request ID middleware.
 *
 * Reads an incoming `X-Request-ID` header (or custom header name) from the
 * request. If absent, generates a new UUID. Sets the response header and
 * injects `ctx.requestId`.
 *
 * ```ts
 * import { requestId } from 'weifuwu'
 * app.use(requestId())
 *
 * app.get('/', (req, ctx) => {
 *   console.log('request ID:', ctx.requestId)
 * })
 * ```
 */
export function requestId(options?: RequestIdOptions): Middleware<Context, Context & { requestId: string }> {
  const header = options?.header ?? 'X-Request-ID'
  const gen = options?.generator ?? (() => crypto.randomUUID())

  return async (req, ctx, next) => {
    const existing = req.headers.get(header)
    const id = existing ?? gen()
    ;(ctx as any).requestId = id
    const res = await next(req, ctx as Context & { requestId: string })
    if (res.headers.has(header)) return res
    const h = new Headers(res.headers)
    h.set(header, id)
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h })
  }
}
