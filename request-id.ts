import crypto from 'node:crypto'
import type { Context, Middleware } from './types.ts'

export interface RequestIdOptions {
  header?: string
  generator?: () => string
}

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
