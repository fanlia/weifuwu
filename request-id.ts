import crypto from 'node:crypto'
import type { Middleware } from './types.ts'

export interface RequestIdOptions {
  header?: string
  generator?: () => string
}

export function requestId(options?: RequestIdOptions): Middleware {
  const header = options?.header ?? 'X-Request-ID'
  const gen = options?.generator ?? (() => crypto.randomUUID())

  return async (req, ctx, next) => {
    const existing = req.headers.get(header)
    const id = existing ?? gen()
    ;(ctx as any).requestId = id
    const res = await next(req, ctx)
    if (res.headers.has(header)) return res
    const h = new Headers(res.headers)
    h.set(header, id)
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h })
  }
}
