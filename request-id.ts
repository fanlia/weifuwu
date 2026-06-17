/* eslint-disable @typescript-eslint/no-explicit-any */
import crypto from 'node:crypto'
import type { Context, Middleware } from './types.ts'

// Augment Context with requestId property
declare module './types.ts' {
  interface Context {
    requestId: string
  }
}

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
 * @deprecated Use `trace()` from 'weifuwu' instead — it injects `ctx.trace.requestId`
 * along with `traceId` and `elapsed()` in a single middleware.
 *
 * ```ts
 * // Old:
 * app.use(requestId())
 * ctx.requestId
 *
 * // New:
 * app.use(trace())
 * ctx.trace.requestId
 * ```
 *
 * Reads an incoming `X-Request-ID` header (or custom header name) from the
 * request. If absent, generates a new UUID. Sets the response header and
 * injects `ctx.requestId`.
 */
export function requestId(
  options?: RequestIdOptions,
): Middleware<Context, Context & { requestId: string }> {
  const header = options?.header ?? 'X-Request-ID'
  const gen = options?.generator ?? (() => crypto.randomUUID())

  const mw: Middleware<Context, Context & { requestId: string }> = async (req, ctx, next) => {
    const existing = req.headers.get(header)
    const id = existing ?? gen()
    ;(ctx as any).requestId = id
    const res = await next(req, ctx as Context & { requestId: string })
    if (res.headers.has(header)) return res
    const h = new Headers(res.headers)
    h.set(header, id)
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h })
  }
  ;(mw as any).__meta = { injects: ['requestId'], depends: [] }
  return mw
}
