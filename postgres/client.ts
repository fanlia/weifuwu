/* eslint-disable @typescript-eslint/no-explicit-any */
import postgresFactory from 'postgres'
import type { Context, Handler } from '../types.ts'
import type { PostgresOptions, PostgresClient } from './types.ts'

/** Migration tracking table name. Created automatically on first migrate(). */
export const MIGRATIONS_TABLE = '_weifuwu_migrations'

/** PostgreSQL error codes that are safe to retry. */
const RETRYABLE_CODES = new Set(['40P01', '40001'])

function isRetryable(err: unknown): boolean {
  return err instanceof Error && 'code' in err && RETRYABLE_CODES.has((err as any).code)
}

export function postgres(opts?: string | PostgresOptions): PostgresClient {
  const options: PostgresOptions = typeof opts === 'string' ? { connection: opts } : (opts ?? {})

  const connection = options.connection ?? process.env.DATABASE_URL
  if (!connection) {
    throw new Error(
      'postgres: DATABASE_URL is not set. Pass a connection string or set the DATABASE_URL environment variable.',
    )
  }

  const stmtTimeout = options.statementTimeout ?? 30_000
  // Inject statement_timeout via connection options parameter.
  // URL-encoded: SET statement_timeout = <ms>
  let connStr = typeof connection === 'string' ? connection : ''
  if (stmtTimeout > 0 && typeof connection === 'string') {
    const sep = connStr.includes('?') ? '&' : '?'
    connStr = `${connStr}${sep}options=-c%20statement_timeout%3D${stmtTimeout}`
  }

  const sql = postgresFactory(connStr as any, {
    max: options.max,
    ssl: options.ssl,
    idle_timeout: options.idle_timeout,
    connect_timeout: options.connect_timeout,
  }) as any

  if (options.signal) {
    options.signal.addEventListener(
      'abort',
      () => {
        sql.end()
      },
      { once: true },
    )
  }

  const closeTimeout = options.closeTimeout ?? 5

  // ── Connection pool tracking ────────────────────────────────────
  const _active = 0
  const _waiting = 0
  const poolMax = options.max ?? 10

  const mw = ((req: Request, ctx: Context, next: Handler) => {
    ctx.sql = sql
    return next(req, ctx)
  }) as unknown as PostgresClient
  mw.__meta = { injects: ['sql'], depends: [] }

  mw.sql = sql

  mw.migrate = async () => {
    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS "${MIGRATIONS_TABLE}" (
        name TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)
  }

  mw.markMigrated = async (moduleName: string) => {
    await sql.unsafe(
      `INSERT INTO "${MIGRATIONS_TABLE}" (name) VALUES ($1) ON CONFLICT DO NOTHING`,
      [moduleName],
    )
  }

  mw.isMigrated = async (moduleName: string): Promise<boolean> => {
    const [row] = (await sql.unsafe(`SELECT 1 FROM "${MIGRATIONS_TABLE}" WHERE name = $1`, [
      moduleName,
    ])) as any[]
    return !!row
  }

  // ── Transaction with retry ──────────────────────────────────────
  mw.transaction = (async (fn: any, retryOpts?: { maxRetries?: number }) => {
    const maxRetries = retryOpts?.maxRetries ?? 3

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const result = await sql.begin(fn)
        return result
      } catch (err) {
        if (attempt < maxRetries && isRetryable(err)) {
          const delay = Math.min(100 * Math.pow(2, attempt - 1), 1000)
          await new Promise((r) => setTimeout(r, delay))
          continue
        }
        throw err
      }
    }
    // Unreachable — last attempt throws above
    throw new Error('transaction: max retries exceeded')
  }) as any

  mw.poolStats = () => ({
    active: _active,
    idle: poolMax - _active - _waiting,
    waiting: _waiting,
    max: poolMax,
  })

  mw.close = () => sql.end({ timeout: closeTimeout })

  return mw
}
