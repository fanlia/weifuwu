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
  /** 命令超时 ms（服务器慢/挂起时 reject；阻塞命令 resolve(null)）。默认 0 = 禁用。 */
  commandTimeoutMs?: number
  /** socket 响应超时 ms（僵尸自愈：有 pending 且超时无数据 → 主动断开重连）。默认 0 = 禁用。 */
  socketTimeoutMs?: number
  /** 命令观测钩子（慢命令日志/审计）；第 4 参数为请求级 traceId（x-trace-id 头，无则 undefined） */
  onCommand?: (command: string, args: (string | number)[], durationMs: number, traceId?: string) => void
}

export interface RedisInjected {
  redis: RedisPool
}

export interface RedisClient extends Middleware<Context, Context & RedisInjected>, Closeable {
  redis: RedisPool
  close: () => Promise<void>
}
