import type { Sql } from '../vendor.ts'
import type { Context, Middleware } from '../types.ts'
import type { ColumnBuilder, BoundTable } from './schema/index.ts'

declare module '../types.ts' {
  interface Context {
    sql: Sql<{}>
  }
}

export interface PostgresInjected {
  sql: Sql<{}>
}

export interface PostgresOptions {
  connection?: string | Record<string, unknown>
  signal?: AbortSignal
  closeTimeout?: number
  max?: number
  ssl?: boolean | Record<string, unknown>
  idle_timeout?: number
  connect_timeout?: number
  /** Called after every query completes. Receives query text, duration in ms, and row count. */
  onQuery?: (query: string, durationMs: number, rowCount: number) => void
}

export interface PostgresClient extends Middleware<Context, Context & PostgresInjected> {
  sql: Sql<{}>
  /** Creates the migration tracking table (_weifuwu_migrations). Called once at startup. */
  migrate: () => Promise<void>
  /** Record that a module's migration has been applied (idempotent). */
  markMigrated: (moduleName: string) => Promise<void>
  /** Check whether a module has already been migrated. */
  isMigrated: (moduleName: string) => Promise<boolean>
  table: <R extends Record<string, unknown>>(
    tableName: string,
    builders: { [K in keyof R]: ColumnBuilder<R[K]> },
  ) => BoundTable<R>
  transaction: <T>(fn: (sql: any) => Promise<T>) => Promise<T>
  close: () => Promise<void>
}
