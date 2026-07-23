import { Redis as IORedis } from 'ioredis'
import type { Context, Handler } from '../types.ts'
import type { RedisOptions, RedisClient } from './types.ts'

export function redis(options?: string | RedisOptions): RedisClient {
  const opts: RedisOptions = typeof options === 'string' ? { url: options } : (options ?? {})

  const url = opts.url ?? process.env.REDIS_URL ?? 'redis://localhost:6379'
  const client = new IORedis(url, opts)
  // Log async Redis errors (connection drops, reconnection failures, etc.)
  // that can't be caught by request-level try/catch.
  // Request-level errors are still thrown by the ioredis client and caught by the caller.
  client.on('error', (err: Error) => {
    console.error('[redis]', err.message)
  })


  const mw = ((req: Request, ctx: Context, next: Handler) => {
    ctx.redis = client
    return next(req, ctx)
  }) as unknown as RedisClient

  mw.__meta = { injects: ['redis'], depends: [] }
  mw.redis = client
  mw.close = () => client.quit() as unknown as Promise<void>

  return mw
}
