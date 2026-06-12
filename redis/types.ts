import type { Redis, RedisOptions as IORedisOptions } from '../vendor.ts'
import type { Context, Middleware } from '../types.ts'

declare module '../types.ts' {
  interface Context {
    redis: Redis
  }
}

export type { Redis }

export type RedisOptions = IORedisOptions & {
  url?: string
}

export interface RedisInjected {
  redis: Redis
}

export interface RedisClient extends Middleware<Context, Context & RedisInjected> {
  redis: Redis
  close: () => Promise<void>
}
