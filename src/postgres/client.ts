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
import { HttpError } from '../types.ts'
import { AsyncLocalStorage } from 'node:async_hooks'
import type { PostgresOptions, PostgresClient, SqlClient } from './types.ts'

export const MIGRATIONS_TABLE = '_weifuwu_migrations'

/** 请求级 traceId 存储（x-trace-id 头 → ALS → onQuery 第 4 参数，慢查询日志可关联请求） */
const traceStore = new AsyncLocalStorage<string>()

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
    poolSize: opts.max ?? opts.poolSize ?? 10,
    acquireTimeoutMs: opts.acquireTimeoutMs,
    statementTimeoutMs: opts.statementTimeoutMs ?? opts.statementTimeout,
    // onQuery 包装：从 ALS 读请求级 traceId 追加到第 4 参数（后端兼容——不传时不注入）
    onQuery: opts.onQuery
      ? (sql, durationMs, rowCount) => {
          const tid = traceStore.getStore()
          opts.onQuery?.(sql, durationMs, rowCount, tid || undefined)
        }
      : undefined,
  })

  const sql = makeSql(pool)

  const mw = ((req: Request, ctx: Context, next: Handler) => {
    ctx.sql = sql
    // 请求级 traceId：x-trace-id 头（无则空串——onQuery 层转 undefined）
    return traceStore.run(req.headers.get('x-trace-id') ?? '', () => next(req, ctx))
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

/** 惰性查询：await 时执行；作为插值时是片段（postgres.js 语义） */
class TaggedQuery<T> {
  text: string
  params: unknown[]
  private executor: (sql: string, params: unknown[]) => Promise<T[]>

  constructor(text: string, params: unknown[], executor: (sql: string, params: unknown[]) => Promise<T[]>) {
    this.text = text
    this.params = params
    this.executor = executor
  }

  then<R1 = T[], R2 = never>(
    resolve?: ((value: T[]) => R1 | PromiseLike<R1>) | null,
    reject?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
  ): Promise<R1 | R2> {
    return this.executor(this.text, this.params).then(resolve, reject)
  }

  catch<R>(reject?: ((reason: unknown) => R | PromiseLike<R>) | null): Promise<T[] | R> {
    return this.executor(this.text, this.params).catch(reject)
  }

  finally(fn: () => void): Promise<T[]> {
    return this.executor(this.text, this.params).finally(fn)
  }

  /** 嵌套片段（agent-platform 条件过滤模式） */
  get __fragment(): { sql: string; params: unknown[] } {
    return { sql: this.text, params: this.params }
  }
}

/** 将 PgPool 包装为 callable tagged template sql（postgres.js 兼容面） */
function makeSql(pool: PgPool): SqlClient {
  const sql = ((strings: TemplateStringsArray, ...values: unknown[]) => {
    const { sql: text, params } = parseTaggedFromPool(strings, values)
    return new TaggedQuery(text, params, (s, p) => wrapError(pool.query(s, p as any)))
  }) as unknown as SqlClient

  sql.unsafe = (query: string, params?: unknown[]) => wrapError(pool.unsafe(query, params as any))
  sql.query = (query: string, params?: unknown[]) => wrapError(pool.query(query, params as any))
  sql.begin = (fn: any) => pool.begin(fn)
  sql.transaction = (fn: any) => pool.transaction(fn)
  sql.close = () => pool.close()

  return sql
}


/** tagged template → 参数化 SQL（插值=参数；插值是 TaggedQuery/片段 → 内联重编号） */
function parseTaggedFromPool(strings: TemplateStringsArray, values: unknown[]): { sql: string; params: unknown[] } {
  let sql = strings[0]
  const params: unknown[] = []
  for (let i = 0; i < values.length; i++) {
    const frag = (values[i] as { __fragment?: { sql: string; params: unknown[] } } | undefined)?.__fragment
    if (frag) {
      const renumbered = frag.sql.replace(/\$(\d+)/g, (_m, idx: string) => {
        params.push(frag.params[parseInt(idx, 10) - 1])
        return `$${params.length}`
      })
      sql += renumbered + strings[i + 1]
    } else {
      params.push(values[i])
      sql += `$${params.length}` + strings[i + 1]
    }
  }
  return { sql, params }
}

/** PG 错误码 → HttpError 映射（框架默认，业务无需手写 catch） */
const PG_ERROR_MAP: Record<string, number> = {
  '23505': 409, // unique_violation
  '23503': 400, // foreign_key_violation
  '23502': 400, // not_null_violation
  '23514': 400, // check_violation
  '22P02': 400, // invalid_text_representation
  '22003': 400, // numeric_value_out_of_range
}

/** 包装查询 promise：错误码映射为 HttpError（未映射的透传） */
function wrapError<T>(promise: Promise<T>): Promise<T> {
  return promise.catch((err: unknown) => {
    const code = (err as { code?: string } | null)?.code
    if (code && PG_ERROR_MAP[code]) {
      throw new HttpError(`数据库错误: ${(err as Error).message}`, PG_ERROR_MAP[code])
    }
    throw err
  })
}
