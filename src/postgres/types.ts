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
  connection?: string
  signal?: AbortSignal
  closeTimeout?: number
  /** 池大小（连接数）。默认 10。 */
  max?: number
  ssl?: boolean | Record<string, unknown>
  idle_timeout?: number
  connect_timeout?: number
  /** 兼容保留（自研客户端暂以连接池替代 statement_timeout 注入） */
  statementTimeout?: number
  /** Called after every query completes. */
  onQuery?: (query: string, durationMs: number, rowCount: number) => void
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
