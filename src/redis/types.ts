import type { Context, Middleware, Closeable } from '../types.ts'
import type { RedisPool } from '../db/redis/pool.ts'

declare module '../types.ts' {
  interface Context {
    redis: RedisPool
  }
}

export type { RedisPool as Redis }

export type RedisOptions = {
  url?: string
  /** 池大小（连接数）。默认 5。 */
  poolSize?: number
  /** 所有 key 自动加前缀（多应用共享 Redis 时隔离命名空间） */
  keyPrefix?: string
  /** 未连接时命令是否入队等待。默认 true。 */
  enableOfflineQueue?: boolean
}

export interface RedisInjected {
  redis: RedisPool
}

export interface RedisClient extends Middleware<Context, Context & RedisInjected>, Closeable {
  redis: RedisPool
  close: () => Promise<void>
}
