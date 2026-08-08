/**
 * weifuwu/redis — Redis 中间件（自研客户端）
 *
 * 注入 ctx.redis（RedisPool：懒连接，首命令才建立连接）。
 * 零第三方依赖——RESP2 协议自研。
 */

import { RedisPool } from '../db/redis/pool.ts'
import type { Context, Handler } from '../types.ts'
import type { RedisOptions, RedisClient } from './types.ts'

export function redis(options?: string | RedisOptions): RedisClient {
  const opts: RedisOptions = typeof options === 'string' ? { url: options } : (options ?? {})

  const url = opts.url ?? process.env.REDIS_URL ?? 'redis://localhost:6379'
  const u = new URL(url)
  const pool = new RedisPool({
    host: u.hostname,
    port: Number(u.port || 6379),
    poolSize: opts.poolSize,
    keyPrefix: opts.keyPrefix,
    enableOfflineQueue: opts.enableOfflineQueue,
    commandTimeoutMs: opts.commandTimeoutMs,
    socketTimeoutMs: opts.socketTimeoutMs,
  })

  const mw = (async (req: Request, ctx: Context, next: Handler) => {
    ctx.redis = pool
    return next(req, ctx)
  }) as unknown as RedisClient

  mw.__meta = { injects: ['redis'], depends: [] }
  mw.redis = pool
  mw.close = () => pool.close()

  return mw
}
