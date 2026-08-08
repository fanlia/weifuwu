import type { Row } from '../db/postgres/connection.ts'
import type { Context, Middleware, Closeable } from '../types.ts'

declare module '../types.ts' {
  interface Context {
    sql: SqlClient
  }
}

/** callable tagged template sql（postgres.js 兼容面） */
export interface SqlClient {
  (strings: TemplateStringsArray, ...values: unknown[]): Promise<Row[]>
  /** 原生 SQL（DDL / 动态表名）；$1 占位符 + 参数 */
  unsafe(sql: string, params?: unknown[]): Promise<Row[]>
  /** 参数化查询 */
  query(sql: string, params?: unknown[]): Promise<Row[]>
  /** 事务（postgres.js 兼容）：回调收到 tagged template 事务 sql */
  begin<T>(fn: (sql: SqlClient) => Promise<T>): Promise<T>
  /** 事务（框架式）：回调收到 { query } */
  transaction<T>(fn: (tx: { query: (sql: string, params?: unknown[]) => Promise<Row[]> }) => Promise<T>): Promise<T>
  close(): Promise<void>
}

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
