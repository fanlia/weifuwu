import { Redis as IORedis } from 'ioredis'
import type { Context, Handler } from '../types.ts'
import type { RedisOptions, RedisClient } from './types.ts'

export function redis(opts?: string | RedisOptions): RedisClient {
  const options: RedisOptions = typeof opts === 'string' ? { url: opts } : (opts ?? {})

  const url = options.url ?? process.env.REDIS_URL ?? 'redis://localhost:6379'
  const client = new IORedis(url, options)
  client.on('error', () => { /* Redis errors are handled by the caller via try/catch */ })


  const mw = ((req: Request, ctx: Context, next: Handler) => {
    ctx.redis = client
    return next(req, ctx)
  }) as unknown as RedisClient

  mw.__meta = { injects: ['redis'], depends: [] }
  mw.redis = client
  mw.close = () => client.quit() as unknown as Promise<void>

  return mw
}
