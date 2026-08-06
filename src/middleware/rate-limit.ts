/**
 * weifuwu/rateLimit — 限流中间件
 *
 * 注入 ctx.limit（手动限流）+ 全局请求限流。
 *
 * store:
 *   - redis（默认）：fixed（INCR + EXPIRE，原子无竞态）或 sliding（ZSET 时间戳），
 *     计数在 redis 内 → 多实例天然一致
 *   - memory：进程内 Map，仅单实例/开发环境（多实例会互相放行，文档红线）
 *
 * 裁剪声明：
 *   ✅ fixed / sliding / redis / memory / 响应头 / ctx.limit / 自定义 key
 *   ❌ 多级限流 DSL、配额策略引擎、动态规则热更新、按租户配额（应用层）
 *
 * ```ts
 * import { rateLimit } from 'weifuwu'
 *
 * app.use(redis())
 * app.use(rateLimit({ windowMs: 60_000, max: 100 }))       // 全局限流
 *
 * app.get('/api/search', async (req, ctx) => {
 *   await ctx.limit('search', { max: 30, windowMs: 60_000 }) // 手动限流
 *   ...
 * })
 * ```
 */

import type { Context, Handler, Middleware } from '../types.ts'
import { HttpError } from '../types.ts'
import type { RedisPool } from '../db/redis/pool.ts'

export type RateLimitAlgorithm = 'fixed' | 'sliding'
export type RateLimitStore = 'redis' | 'memory'

export interface RateLimitOptions {
  /** 时间窗口（ms）。默认 60_000。 */
  windowMs?: number
  /** 窗口内最大请求数。默认 100。 */
  max?: number
  /** 限流键（默认取 X-Forwarded-For 首个 IP；生产环境请配置反向代理注入该头）。 */
  key?: (req: Request) => string
  /** 算法。'fixed'（默认）| 'sliding'（sliding 仅支持 redis store） */
  algorithm?: RateLimitAlgorithm
  /** 存储。'redis'（默认）| 'memory'（单实例/开发） */
  store?: RateLimitStore
  /** 超限状态码。默认 429。 */
  statusCode?: number
  /** 超限错误消息。默认 'Too Many Requests'。 */
  message?: string
  /** 是否输出 RateLimit-* / Retry-After 响应头。默认 true。 */
  headers?: boolean
}

/** ctx.limit 手动限流注入 */
export interface RateLimitInjected {
  /**
   * 手动限流（handler 内对特定资源限流）。
   * 超限抛 HttpError（默认 429）。
   *
   * ```ts
   * await ctx.limit('search', { max: 30, windowMs: 60_000 })
   * ```
   */
  limit: (name: string, opts?: { max?: number; windowMs?: number }) => Promise<void>
}

declare module '../types.ts' {
  interface Context {
    limit?: RateLimitInjected['limit']
  }
}

export interface RateLimitClient extends Middleware<Context, Context & RateLimitInjected> {}

interface LimitResult {
  allowed: boolean
  remaining: number
  resetSeconds: number
}

interface MemoryState {
  count: number
  resetAt: number
}

const PREFIX = 'rl:'

export function rateLimit(options?: RateLimitOptions): RateLimitClient {
  const opts = {
    windowMs: options?.windowMs ?? 60_000,
    max: options?.max ?? 100,
    key:
      options?.key ??
      ((req: Request) =>
        req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'),
    algorithm: options?.algorithm ?? ('fixed' as RateLimitAlgorithm),
    store: options?.store ?? ('redis' as RateLimitStore),
    statusCode: options?.statusCode ?? 429,
    message: options?.message ?? 'Too Many Requests',
    headers: options?.headers ?? true,
  }

  if (opts.store === 'memory' && opts.algorithm === 'sliding') {
    throw new Error('rateLimit: algorithm "sliding" requires store "redis" (memory store 仅支持 fixed)')
  }

  let redisPool: RedisPool | null = null
  const memoryStore = new Map<string, MemoryState>()

  function requireRedis(ctx: Context): void {
    if (redisPool) return
    const pool = (ctx as Context & { redis?: RedisPool }).redis
    if (!pool) {
      throw new Error(
        'rateLimit: store "redis" requires redis() middleware first — app.use(redis()) 必须在 rateLimit 之前注册',
      )
    }
    redisPool = pool
  }

  /** 核心：检查并计数。返回 { allowed, remaining, resetSeconds } */
  async function check(key: string, max: number, windowMs: number): Promise<LimitResult> {
    if (opts.store === 'memory') {
      const now = Date.now()
      const state = memoryStore.get(key)
      if (!state || state.resetAt <= now) {
        memoryStore.set(key, { count: 1, resetAt: now + windowMs })
        return { allowed: true, remaining: Math.max(0, max - 1), resetSeconds: Math.ceil(windowMs / 1000) }
      }
      if (state.count >= max) {
        return { allowed: false, remaining: 0, resetSeconds: Math.ceil((state.resetAt - now) / 1000) }
      }
      state.count++
      return { allowed: true, remaining: Math.max(0, max - state.count), resetSeconds: Math.ceil((state.resetAt - now) / 1000) }
    }

    // ── redis store ──
    if (opts.algorithm === 'fixed') {
      // INCR 原子；首个请求（返回 1）时设 TTL——并发重复 EXPIRE 幂等无害，无需 Lua
      // PEXPIRE（ms 精度）：windowMs < 1s 时 EXPIRE 秒粒度会虚增 TTL（ceil(500ms)=1s）
      const count = await redisPool!.incr(PREFIX + key)
      if (count === 1) {
        await redisPool!.command('PEXPIRE', PREFIX + key, windowMs)
      }
      return {
        allowed: count <= max,
        remaining: Math.max(0, max - count),
        resetSeconds: Math.max(1, Math.ceil(await redisPool!.ttl(PREFIX + key))),
      }
    }

    // sliding：ZSET 存时间戳，惰性清理窗口外记录 + key 级 TTL 兜底
    const fullKey = PREFIX + key
    const now = Date.now()
    const min = now - windowMs
    await redisPool!.command('ZREMRANGEBYSCORE', fullKey, 0, min)
    const count = Number(await redisPool!.command('ZCARD', fullKey))
    if (count >= max) {
      const ttl = Number(await redisPool!.command('TTL', fullKey))
      return { allowed: false, remaining: 0, resetSeconds: Math.max(1, ttl) }
    }
    const added = Number(
      await redisPool!.command('ZADD', fullKey, now, `${now}-${Math.random().toString(36).slice(2)}`),
    )
    if (added === 1) {
      // 新 key：窗口过期后整 key 消失（内存回收）
      await redisPool!.command('EXPIRE', fullKey, Math.ceil(windowMs / 1000) * 2)
    }
    return { allowed: true, remaining: Math.max(0, max - count - 1), resetSeconds: Math.ceil(windowMs / 1000) }
  }

  function tooMany(resetSeconds: number): Response {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (opts.headers) {
      headers['Retry-After'] = String(resetSeconds)
      headers['RateLimit-Limit'] = String(opts.max)
      headers['RateLimit-Remaining'] = '0'
      headers['RateLimit-Reset'] = String(resetSeconds)
    }
    return new Response(JSON.stringify({ error: opts.message, retryAfter: resetSeconds }), {
      status: opts.statusCode,
      headers,
    })
  }

  const mw = (async (req: Request, ctx: Context, next: Handler) => {
    if (opts.store === 'redis') requireRedis(ctx)

    // 注入 ctx.limit（手动限流）——超限抛 HttpError（router/serve 自动转状态码）
    ctx.limit = async (name: string, manual?: { max?: number; windowMs?: number }) => {
      const key = `${PREFIX}${name}`
      const max = manual?.max ?? opts.max
      const windowMs = manual?.windowMs ?? opts.windowMs
      const r = await check(key, max, windowMs)
      if (!r.allowed) {
        const err = new HttpError(opts.message, opts.statusCode)
        ;(err as HttpError & { retryAfter?: number }).retryAfter = r.resetSeconds
        throw err
      }
    }

    // 全局限流
    const r = await check(PREFIX + 'global:' + opts.key(req), opts.max, opts.windowMs)
    if (!r.allowed) return tooMany(r.resetSeconds)

    const res = await next(req, ctx)
    if (opts.headers) {
      res.headers.set('RateLimit-Limit', String(opts.max))
      res.headers.set('RateLimit-Remaining', String(r.remaining))
      res.headers.set('RateLimit-Reset', String(r.resetSeconds))
    }
    return res
  }) as unknown as RateLimitClient

  mw.__meta = { injects: ['limit'], depends: opts.store === 'redis' ? ['redis'] : [] }

  return mw
}
