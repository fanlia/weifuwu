import type { Sql } from '../vendor.ts'
import type { Context, Handler } from '../types.ts'
import type { ColumnBuilder, BoundTable } from './schema/index.ts'

declare module '../types.ts' {
  interface Context {
    sql: Sql<{}>
  }
}

export interface PostgresOptions {
  connection?: string | Record<string, unknown>
  signal?: AbortSignal
  closeTimeout?: number
  max?: number
  ssl?: boolean | Record<string, unknown>
  idle_timeout?: number
  connect_timeout?: number
}

export interface PostgresClient {
  (req: Request, ctx: Context, next: Handler): Response | Promise<Response>
  sql: Sql<{}>
  migrate: () => Promise<void>
  table: <R extends Record<string, unknown>>(
    tableName: string,
    builders: { [K in keyof R]: ColumnBuilder<R[K]> },
  ) => BoundTable<R>
  transaction: <T>(fn: (sql: any) => Promise<T>) => Promise<T>
  close: () => Promise<void>
}
