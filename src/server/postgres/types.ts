import type { Context, Middleware, Closeable } from '../types.ts'
import type { Sql, Row } from '../db/contracts.ts'

declare module '../types.ts' {
  interface Context {
    sql: Sql
  }
}

/** 契约：SQL 标签模板（ctx.sql）——定义于 src/db/contracts.ts（自研引擎实现） */
export type { Sql }

/** 旧名兼容（SqlClient → Sql，契约单一来源 db/contracts.ts） */
export type SqlClient = Sql

export interface PostgresInjected {
  sql: SqlClient
}

export interface PostgresOptions {
  /** 连接字符串（默认 DATABASE_URL） */
  connection?: string
  /** 池大小（连接数）。默认 10。 */
  max?: number
  /** 池全忙时 acquire 超时 ms（防饿死）。默认 30_000。0 = 无限。 */
  acquireTimeoutMs?: number
  /** 语句超时 ms（慢查询保护，会话级 SET statement_timeout）。默认 0 = 禁用。 */
  statementTimeoutMs?: number
  /** 查询观测钩子（慢查询日志/审计） */
  /** 查询观测钩子（慢查询日志/审计）；第 4 参数为请求级 traceId（x-trace-id 头，无则 undefined） */
  onQuery?: (query: string, durationMs: number, rowCount: number, traceId?: string) => void
  /** postgres.js 兼容名（= max） */
  poolSize?: number
  /** postgres.js 兼容名（= statementTimeoutMs） */
  statementTimeout?: number
  /** 连接超时 ms。默认 10_000。 */
  connect_timeout?: number
  signal?: AbortSignal
  closeTimeout?: number
  ssl?: boolean | Record<string, unknown>
  /** 空闲连接回收 ms（超时未使用的连接关闭，池容量收缩；下次需要时自动重建）。
   *  默认 0 = 禁用（峰值连接常驻——watch 重启叠加期易击穿 pg max_connections）。
   *  dev/长生命周期进程建议 30_000。 */
  idle_timeout?: number
}

export interface PostgresClient extends Middleware<Context, Context & PostgresInjected>, Closeable {
  sql: SqlClient
  /** Creates the migration tracking table (_weifuwu_migrations). Called once at startup. */
  migrate: () => Promise<void>
  /** Record that a module's migration has been applied (idempotent). */
  markMigrated: (moduleName: string) => Promise<void>
  /** Check whether a module has already been migrated. */
  isMigrated: (moduleName: string) => Promise<boolean>
  transaction: <T>(fn: (sql: SqlClient) => Promise<T>, retryOpts?: { maxRetries?: number }) => Promise<T>
  /** Connection pool configuration summary. */
  poolStats: () => { active: number; idle: number; waiting: number; max: number }
  close: () => Promise<void>
}
