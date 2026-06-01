import type { Sql } from '../vendor.ts'
import type { Context, Handler } from '../types.ts'

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
  transaction: <T>(fn: (sql: any) => Promise<T>) => Promise<T>
  close: () => Promise<void>
}
