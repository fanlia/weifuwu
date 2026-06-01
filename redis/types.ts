import type { Redis, RedisOptions as IORedisOptions } from '../vendor.ts'
import type { Context, Handler } from '../types.ts'

declare module '../types.ts' {
  interface Context {
    redis: Redis
  }
}

export type { Redis }

export type RedisOptions = IORedisOptions & {
  url?: string
}

export interface RedisClient {
  (req: Request, ctx: Context, next: Handler): Response | Promise<Response>
  redis: Redis
  close: () => Promise<void>
}
