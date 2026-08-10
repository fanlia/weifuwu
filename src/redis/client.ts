/**
 * weifuwu/redis — Redis 中间件（自研客户端）
 *
 * 注入 ctx.redis（RedisPool：懒连接，首命令才建立连接）。
 * 零第三方依赖——RESP2 协议自研。
 */

import { RedisPool } from '../db/redis/pool.ts'
import type { Context, Handler } from '../types.ts'
import { AsyncLocalStorage } from 'node:async_hooks'
import type { RedisOptions, RedisClient } from './types.ts'

/** 请求级 traceId 存储（x-trace-id 头 → ALS → onCommand 第 4 参数，慢命令可关联请求） */
const traceStore = new AsyncLocalStorage<string>()

export function redis(options?: string | RedisOptions): RedisClient {
  const opts: RedisOptions = typeof options === 'string' ? { url: options } : (options ?? {})

  const url = opts.url ?? process.env.REDIS_URL
  if (!url) {
    throw new Error(
      'redis: REDIS_URL is not set. Pass a URL or set the REDIS_URL environment variable.',
    )
  }
  const u = new URL(url)
  const pool = new RedisPool({
    host: u.hostname,
    port: Number(u.port || 6379),
    poolSize: opts.poolSize,
    keyPrefix: opts.keyPrefix,
    enableOfflineQueue: opts.enableOfflineQueue,
    commandTimeoutMs: opts.commandTimeoutMs,
    socketTimeoutMs: opts.socketTimeoutMs,
    // onCommand 包装：从 ALS 读请求级 traceId 追加到第 4 参数（无头不注入）
    onCommand: opts.onCommand
      ? (cmd, args, dur) => {
          const tid = traceStore.getStore()
          opts.onCommand?.(cmd, args, dur, tid || undefined)
        }
      : undefined,
  })

  const mw = (async (req: Request, ctx: Context, next: Handler) => {
    ctx.redis = pool
    // 请求级 traceId：x-trace-id 头（无则空串——onCommand 层转 undefined）
    return traceStore.run(req.headers.get('x-trace-id') ?? '', () => next(req, ctx))
  }) as unknown as RedisClient

  mw.__meta = { injects: ['redis'], depends: [] }
  mw.redis = pool
  mw.close = () => pool.close()

  return mw
}
