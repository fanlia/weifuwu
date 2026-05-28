import type { Sql } from 'postgres'
import type { z } from 'zod'
import type { Context, Handler } from '../types.ts'

declare module '../types.ts' {
  interface Context {
    sql: Sql<{}>
  }
}

export interface PostgresOptions {
  connection?: string | Record<string, unknown>
  signal?: AbortSignal
}

export interface PostgresClient {
  (req: Request, ctx: Context, next: Handler): Response | Promise<Response>
  sql: Sql<{}>
  table: TableBuilder
  migrate: () => Promise<void>
  close: () => Promise<void>
}

export type TableBuilder = <T extends Record<string, z.ZodTypeAny>>(
  name: string,
  schema: T,
  opts?: { primaryKey?: string },
) => TableProxy<z.output<z.ZodObject<T>>, z.input<z.ZodObject<T>>>

export interface TableProxy<TRow = unknown, TInsert = unknown> {
  $type: TRow
  $insert: TInsert
  get: (id: number | string) => Promise<TRow | undefined>
  list: (filter?: Record<string, unknown>, opts?: ListOptions) => Promise<{ rows: TRow[]; count: number }>
  create: (data: TInsert) => Promise<TRow>
  patch: (id: number | string, data: Partial<TInsert>) => Promise<TRow | undefined>
  remove: (id: number | string) => Promise<boolean>
}

export interface ListOptions {
  limit?: number
  offset?: number
  sort?: Record<string, 'asc' | 'desc'>
}

export interface ColumnDef {
  name: string
  sqlType: string
  nullable: boolean
  isPrimaryKey: boolean
  defaultExpr: string | null
  autoGenerate: boolean
}

export interface TableDef {
  name: string
  columns: ColumnDef[]
}
