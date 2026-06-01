import postgresFactory from 'postgres'
import type { Context, Handler } from '../types.ts'
import type { PostgresOptions, PostgresClient } from './types.ts'

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
  mw.migrate = async () => {}
  mw.transaction = (async (fn: any) => {
    return await sql.begin(fn)
  }) as any
  mw.close = () => sql.end({ timeout: closeTimeout })

  return mw
}
