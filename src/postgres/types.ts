/* eslint-disable @typescript-eslint/no-explicit-any */
import type { SqlClient, Context, Middleware, Closeable } from '../types.ts'

declare module '../types.ts' {
  interface Context {
    sql: SqlClient
  }
}

export interface PostgresInjected {
  sql: SqlClient
}

export interface PostgresOptions {
  connection?: string | Record<string, unknown>
  signal?: AbortSignal
  closeTimeout?: number
  max?: number
  ssl?: boolean | Record<string, unknown>
  idle_timeout?: number
  connect_timeout?: number
  /** Per-statement timeout in ms. Set to 0 to disable. Default: 30_000. */
  statementTimeout?: number
  /** Called after every query completes. Receives query text, duration in ms, and row count. */
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
  transaction: <T>(fn: (sql: any) => Promise<T>, retryOpts?: { maxRetries?: number }) => Promise<T>
  /** Snapshot of connection pool state: active, idle, waiting, max connections. */
  poolStats: () => { active: number; idle: number; waiting: number; max: number }
  close: () => Promise<void>
}
