import postgresFactory from 'postgres'
import type { Context, Handler } from '../types.ts'
import type { PostgresOptions, PostgresClient } from './types.ts'
import { BoundTable } from './schema/table.ts'
import type { ColumnBuilder } from './schema/columns.ts'

/** Migration tracking table name. Created automatically on first migrate(). */
export const MIGRATIONS_TABLE = '_weifuwu_migrations'

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

  const sql = postgresFactory(connection as any, {
    max: options.max,
    ssl: options.ssl,
    idle_timeout: options.idle_timeout,
    connect_timeout: options.connect_timeout,
  })

  if (options.signal) {
    options.signal.addEventListener('abort', () => { sql.end() }, { once: true })
  }

  const closeTimeout = options.closeTimeout ?? 5

  const mw = ((req: Request, ctx: Context, next: Handler) => {
    ctx.sql = sql
    return next(req, ctx)
  }) as unknown as PostgresClient

  mw.sql = sql
  mw.table = ((tableName: string, builders: Record<string, ColumnBuilder<unknown>>) => {
    return new BoundTable(sql, tableName, builders)
  }) as any
  mw.migrate = async () => {
    // Ensure migration tracking table exists
    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS "${MIGRATIONS_TABLE}" (
        name TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)
  }
  /** Record that a module's migration has been applied. */
  mw.markMigrated = async (moduleName: string) => {
    await sql.unsafe(
      `INSERT INTO "${MIGRATIONS_TABLE}" (name) VALUES ($1) ON CONFLICT DO NOTHING`,
      [moduleName],
    )
  }
  /** Check if a module's migration has been applied. */
  mw.isMigrated = async (moduleName: string): Promise<boolean> => {
    const [row] = await sql.unsafe(
      `SELECT 1 FROM "${MIGRATIONS_TABLE}" WHERE name = $1`,
      [moduleName],
    ) as any[]
    return !!row
  }
  mw.transaction = (async (fn: any) => {
    return await sql.begin(fn)
  }) as any
  mw.close = () => sql.end({ timeout: closeTimeout })

  return mw
}
