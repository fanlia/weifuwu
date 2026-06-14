import type { Redis } from './vendor.ts'
import type { Context, Handler, Middleware } from './types.ts'

/** Options for {@link rateLimit}. */
export interface RateLimitOptions {
  /** Maximum requests within the window (default: 100). */
  max?: number
  /** Window duration in ms (default: 60000 = 1 minute). */
  window?: number
  /** Custom key function. Default: IP from `x-forwarded-for` or `x-real-ip` or `cf-connecting-ip`. */
  key?: (req: Request, ctx: Context) => string
  /** Custom 429 response body." */
  message?: string
  /** Store backend. `'memory'` (default) or `'redis'`. */
  store?: 'memory' | 'redis'
  /** Redis client (required when `store: 'redis'`). */
  redis?: Redis
  /** Redis key prefix (default: `'ratelimit:'`). */
  prefix?: string
}

function defaultKey(_req: Request, _ctx: Context): string {
  const forwarded = _req.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0]!.trim()
  const realIp = _req.headers.get('x-real-ip')
  if (realIp) return realIp
  const cfIp = _req.headers.get('cf-connecting-ip')
  if (cfIp) return cfIp
  return 'global'
}

/**
 * Rate limiting middleware (in-memory or Redis-backed).
 *
 * Limits requests per key (default: client IP) within a rolling window.
 * Returns 429 when the limit is exceeded, with `Retry-After` header.
 *
 * ```ts
 * import { rateLimit } from 'weifuwu'
 *
 * // In-memory (single process)
 * app.use(rateLimit({ max: 60, window: 60_000 }))
 *
 * // Redis-backed (multi-process)
 * import { Redis } from 'ioredis'
 * app.use(rateLimit({ store: 'redis', redis: new Redis(), max: 100 }))
 * ```
 */
export function rateLimit(options?: RateLimitOptions): Middleware & { close: () => void; stop?: () => void } {
  const max = options?.max ?? 100
  const window = options?.window ?? 60_000
  const getKey = options?.key ?? defaultKey
  const message = options?.message ?? 'Too Many Requests'
  const storeType = options?.store ?? 'memory'

  if (storeType === 'redis' && !options?.redis) {
    throw new Error('rateLimit: redis client required when store: "redis"')
  }

  const redis = options?.redis ?? null
  const keyPrefix = options?.prefix ?? 'ratelimit:'

  // Memory store: in-memory counter map
  const MAX_ENTRIES = 10000
  const hits = new Map<string, { count: number; reset: number }>()

  const interval = storeType === 'memory'
    ? setInterval(() => {
        const now = Date.now()
        for (const [key, entry] of hits) {
          if (entry.reset < now) hits.delete(key)
        }
        if (hits.size > MAX_ENTRIES) {
          const toDelete = hits.size - MAX_ENTRIES
          let deleted = 0
          for (const key of hits.keys()) {
            if (deleted >= toDelete) break
            hits.delete(key)
            deleted++
          }
        }
      }, Math.min(window, 30000))
    : null

  if (interval?.unref) interval.unref()

  // Shared rate check logic — dispatches to memory or redis
  async function checkAndIncrement(key: string): Promise<{ count: number; reset: number }> {
    const now = Date.now()

    if (storeType === 'redis' && redis) {
      const redisKey = `${keyPrefix}${key}`
      const count = await redis.incr(redisKey)
      if (count === 1) {
        await redis.pexpire(redisKey, window)
      }
      const pttl = await redis.pttl(redisKey)
      const reset = pttl > 0 ? now + pttl : now + window
      return { count, reset }
    }

    // Memory store
    let entry = hits.get(key)
    if (!entry || entry.reset < now) {
      hits.set(key, { count: 1, reset: now + window })
      return { count: 1, reset: now + window }
    }
    entry.count++
    return { count: entry.count, reset: entry.reset }
  }

  const mw = async (req: Request, ctx: Context, next: Handler) => {
    const key = getKey(req, ctx)
    const now = Date.now()

    const { count, reset } = await checkAndIncrement(key)

    if (count > max) {
      return new Response(message, {
        status: 429,
        headers: {
          'Retry-After': String(Math.ceil((reset - now) / 1000)),
          'X-RateLimit-Limit': String(max),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String(Math.ceil(reset / 1000)),
        },
      })
    }

    const remaining = max - count
    const res = await next(req, ctx)
    return addRateLimitHeaders(res, max, remaining, reset)
  }

  mw.close = () => {
    if (interval) clearInterval(interval)
    hits.clear()
  }
  ;(mw as any).stop = mw.close  // backward-compatible alias
  ;(mw as any).stats = () => ({
    store: storeType,
    entries: storeType === 'memory' ? hits.size : undefined,
    maxEntries: MAX_ENTRIES,
  })
  return mw
}

function addRateLimitHeaders(res: Response, limit: number, remaining: number, reset: number): Response {
  const headers = new Headers(res.headers)
  headers.set('X-RateLimit-Limit', String(limit))
  headers.set('X-RateLimit-Remaining', String(remaining))
  headers.set('X-RateLimit-Reset', String(Math.ceil(reset / 1000)))
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers })
}
