import type { Middleware } from './types.ts'

export interface RateLimitOptions {
  max?: number
  window?: number
  key?: (req: Request) => string
  message?: string
}

export function rateLimit(options?: RateLimitOptions): Middleware {
  const max = options?.max ?? 100
  const window = options?.window ?? 60_000
  const getKey = options?.key ?? ((req) => {
    const forwarded = req.headers.get('x-forwarded-for')
    if (forwarded) return forwarded.split(',')[0]!.trim()
    const realIp = req.headers.get('x-real-ip')
    if (realIp) return realIp
    const cfIp = req.headers.get('cf-connecting-ip')
    if (cfIp) return cfIp
    return req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'global'
  })
  const message = options?.message ?? 'Too Many Requests'

  const hits = new Map<string, { count: number; reset: number }>()

  const interval = setInterval(() => {
    const now = Date.now()
    for (const [key, entry] of hits) {
      if (entry.reset < now) hits.delete(key)
    }
  }, window)

  if (interval.unref) interval.unref()

  return async (req, ctx, next) => {
    const key = getKey(req)
    const now = Date.now()
    const entry = hits.get(key)

    if (!entry || entry.reset < now) {
      hits.set(key, { count: 1, reset: now + window })
      const res = await next(req, ctx)
      const headers = new Headers(res.headers)
      headers.set('X-RateLimit-Limit', String(max))
      headers.set('X-RateLimit-Remaining', String(max - 1))
      headers.set('X-RateLimit-Reset', String(Math.ceil((now + window) / 1000)))
      return new Response(res.body, { status: res.status, statusText: res.statusText, headers })
    }

    entry.count++
    const remaining = Math.max(0, max - entry.count)

    if (entry.count > max) {
      return new Response(message, {
        status: 429,
        headers: {
          'Retry-After': String(Math.ceil((entry.reset - now) / 1000)),
          'X-RateLimit-Limit': String(max),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String(Math.ceil(entry.reset / 1000)),
        },
      })
    }

    const res = await next(req, ctx)
    const headers = new Headers(res.headers)
    headers.set('X-RateLimit-Limit', String(max))
    headers.set('X-RateLimit-Remaining', String(remaining))
    headers.set('X-RateLimit-Reset', String(Math.ceil(entry.reset / 1000)))
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers })
  }
}
