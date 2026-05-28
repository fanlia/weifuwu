import postgresFactory from 'postgres'
import type { Context, Handler } from '../types.ts'
import type { PostgresOptions, PostgresClient, TableDef } from './types.ts'
import { buildTable } from './table.ts'
import { runMigrations } from './migrate.ts'

export function postgres(opts?: string | PostgresOptions): PostgresClient {
  const options: PostgresOptions = typeof opts === 'string'
    ? { connection: opts }
    : opts ?? {}

  const connection = options.connection ?? process.env.DATABASE_URL
  if (!connection) {
    throw new Error(
      'postgres: DATABASE_URL is not set. Pass a connection string or set the DATABASE_URL environment variable.',
    )
  }

  const sql = postgresFactory(connection as any)
  const tables: TableDef[] = []

  if (options.signal) {
    options.signal.addEventListener('abort', () => { sql.end() }, { once: true })
  }

  const mw = ((req: Request, ctx: Context, next: Handler) => {
    ctx.sql = sql
    return next(req, ctx)
  }) as unknown as PostgresClient

  mw.sql = sql
  mw.table = buildTable(sql, tables) as unknown as PostgresClient['table']
  mw.migrate = () => runMigrations(sql, tables)
  mw.close = () => sql.end({ timeout: 5 })

  return mw
}
