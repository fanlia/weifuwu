import type { Context, Handler, Middleware } from './types.ts'

export interface RateLimitOptions {
  max?: number
  window?: number
  key?: (req: Request) => string
  message?: string
}

export function rateLimit(options?: RateLimitOptions): Middleware & { stop: () => void } {
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

  const MAX_ENTRIES = 10000
  const hits = new Map<string, { count: number; reset: number }>()

  const interval = setInterval(() => {
    const now = Date.now()
    for (const [key, entry] of hits) {
      if (entry.reset < now) hits.delete(key)
    }
    // Evict oldest entries if over cap
    if (hits.size > MAX_ENTRIES) {
      const toDelete = [...hits.entries()].sort((a, b) => a[1].reset - b[1].reset).slice(0, hits.size - MAX_ENTRIES)
      for (const [k] of toDelete) hits.delete(k)
    }
  }, Math.min(window, 30000))

  if (interval.unref) interval.unref()

  const mw = async (req: Request, ctx: Context, next: Handler) => {
    const key = getKey(req)
    const now = Date.now()
    let entry = hits.get(key)

    // Create new entry or reset expired one atomically
    if (!entry || entry.reset < now) {
      hits.set(key, { count: 1, reset: now + window })
      entry = { count: 1, reset: now + window }
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

  mw.stop = () => { clearInterval(interval); hits.clear() }
  return mw
}
