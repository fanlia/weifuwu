/**
 * weifuwu/postgres — PostgreSQL 中间件（自研客户端）
 *
 * 注入 ctx.sql（callable tagged template + 方法面）。
 * 零第三方依赖——PG v3 协议自研。
 *
 *   ctx.sql`SELECT * FROM t WHERE id = ${id}`   ← tagged template → 参数化
 *   ctx.sql.unsafe(sql, params?)                 ← 原生 SQL（DDL/动态表名）
 *   ctx.sql.begin(fn)                            ← 事务（postgres.js 兼容）
 */

import { PgPool } from '../db/postgres/pool.ts'
import type { Row } from '../db/postgres/connection.ts'
import type { Context, Handler } from '../types.ts'
import type { PostgresOptions, PostgresClient, SqlClient } from './types.ts'

export const MIGRATIONS_TABLE = '_weifuwu_migrations'

export function postgres(options?: string | PostgresOptions): PostgresClient {
  const opts: PostgresOptions = typeof options === 'string' ? { connection: options } : (options ?? {})

  const connection = opts.connection ?? process.env.DATABASE_URL
  if (!connection) {
    throw new Error(
      'postgres: DATABASE_URL is not set. Pass a connection string or set the DATABASE_URL environment variable.',
    )
  }

  const u = new URL(connection)
  const pool = new PgPool({
    host: u.hostname,
    port: Number(u.port || 5432),
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: u.pathname.replace(/^\//, ''),
    poolSize: opts.max ?? 10,
  })

  const sql = makeSql(pool)

  const mw = ((req: Request, ctx: Context, next: Handler) => {
    ctx.sql = sql
    return next(req, ctx)
  }) as unknown as PostgresClient
  mw.__meta = { injects: ['sql'], depends: [] }

  mw.sql = sql

  mw.migrate = async () => {
    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS "_weifuwu_migrations" (
        name TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)
  }

  mw.markMigrated = async (moduleName: string) => {
    await sql.unsafe(`INSERT INTO "_weifuwu_migrations" (name) VALUES ($1) ON CONFLICT DO NOTHING`, [
      moduleName,
    ])
  }

  mw.isMigrated = async (moduleName: string): Promise<boolean> => {
    const rows = await sql.unsafe(`SELECT 1 FROM "_weifuwu_migrations" WHERE name = $1`, [moduleName])
    return rows.length > 0
  }

  mw.transaction = (async (fn: any) => {
    return sql.transaction(fn)
  }) as any

  mw.poolStats = () => ({ active: 0, idle: pool.size, waiting: 0, max: pool.size })

  mw.close = () => pool.close()

  return mw
}

/** 将 PgPool 包装为 callable tagged template sql（postgres.js 兼容面） */
function makeSql(pool: PgPool): SqlClient {
  const sql = ((strings: TemplateStringsArray, ...values: unknown[]): Promise<Row[]> => {
    return pool.tag(strings, ...values)
  }) as SqlClient

  sql.unsafe = (query: string, params?: unknown[]) => pool.unsafe(query, params as any)
  sql.query = (query: string, params?: unknown[]) => pool.query(query, params as any)
  sql.begin = (fn: any) => pool.begin(fn)
  sql.transaction = (fn: any) => pool.transaction(fn)
  sql.close = () => pool.close()

  return sql
}
