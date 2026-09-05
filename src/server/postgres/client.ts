/**
 * weifuwu/postgres — PostgreSQL 中间件（自研客户端）
 *
 * 注入 ctx.orm（声明式 ORM——业务唯一数据入口；ctx.sql 已删除）。
 * 零第三方依赖——PG v3 协议自研。
 *
 *   ctx.orm.table('users').select().where({...}).run()   ← 表绑定查询
 *   ctx.orm.query.from(...).join(...)                     ← 跨表查询
 *   ctx.orm.execute(sql, params?)                         ← 原生逃生舱（DDL/迁移）
 */

import { PgPool } from '../db/postgres/pool.ts'
import type { Row, QueryResult } from '../db/postgres/connection.ts'
import type { Context, Handler } from '../types.ts'
import { HttpError } from '../types.ts'
import { AsyncLocalStorage } from 'node:async_hooks'
import type { PostgresOptions, PostgresClient } from './types.ts'
import { compileQuery } from '../db/query.ts'
import { compileSchemaDdl, ddlToSql, type SchemaModule } from '../db/schema.ts'
import { diffConsistency, type ConsistencyIssue, type LiveTable } from '../db/consistency.ts'
import { createOrm, memoryAdapter, postgresAdapter } from '../db/orm.ts'
import { MemorySql } from '../db/memory-sql.ts'

export const MIGRATIONS_TABLE = '_weifuwu_migrations'

/** 请求级 traceId 存储（x-trace-id 头 → ALS → onQuery 第 4 参数，慢查询日志可关联请求） */
const traceStore = new AsyncLocalStorage<string>()

export function postgres(options?: string | PostgresOptions): PostgresClient {
  const opts: PostgresOptions = typeof options === 'string' ? { connection: options } : (options ?? {})
  if (opts.memory) return createMemoryPostgres(opts)

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
    // 空闲收缩（2027-10——透传修复）：opts.idle_timeout 此前仅声明未消费（类型谎言
    // ——写进去静默无效——agent-platform watch 重启连接击穿实证）——池本身已实现
    // reaper（idleTimeoutMs → 空闲超时关闭，容量收缩，acquire 时自动重建），只差
    // 中间件透传。单位 ms；默认 0 = 不收缩（旧行为不变）
    idleTimeoutMs: opts.idle_timeout,
    // onQuery 包装：从 ALS 读请求级 traceId 追加到第 4 参数（后端兼容——不传时不注入）
    onQuery: opts.onQuery
      ? (sql, durationMs, rowCount) => {
          const tid = traceStore.getStore()
          opts.onQuery?.(sql, durationMs, rowCount, tid || undefined)
        }
      : undefined,
  })

  // 声明式 ORM：shape+operator+adapter（Query AST → compileQuery → SQL → 服务器）
  // adapter 执行面与 sql.query 同口径（编译/参数化/错误码映射一致——
  // wrapError 在此层：orm 路径 23505/23503 → 409/400（唯一/FK 冲突不再是 500））
  // W1 接线：options.tenant 传入 createOrm（withCtx 自动 scope 面——中间件 ctx.orm 注入）
  const orm = createOrm(postgresAdapter(
    {
      // 查询面（编译 AST → 参数化 → 池执行；wrapError 错误码映射 23505/23503 → 409/400）
      query: (sql: string, params?: unknown[]) => wrapError(pool.query(sql, params as never)),
      // 事务（同连接）——真语义；类型对齐 PgPool.transaction
      transaction: (<T2>(fn: (tx: { query: (sql: string, params?: unknown[]) => Promise<QueryResult<Row>> }) => Promise<T2>) =>
        pool.transaction(fn as never) as Promise<T2>),
    } as never,
    compileQuery,
  ), opts.tenant)

  const mw = ((req: Request, ctx: Context, next: Handler) => {
    // W1：tenant 配置 → 中间件自动 scope（ctx.orm = withCtx(ctx)——应用零改动）；
    // 未配置 → 原样 orm（无 scope 语义——显式面不受影响）
    ctx.orm = opts.tenant ? orm.withCtx(ctx) : orm
    // 请求级 traceId：x-trace-id 头（无则空串——onQuery 层转 undefined）
    return traceStore.run(req.headers.get('x-trace-id') ?? '', () => next(req, ctx))
  }) as unknown as PostgresClient
  mw.__meta = { injects: ['orm'], depends: [] }

  mw.orm = orm

  mw.migrate = async () => {
    await pool.unsafe(`
      CREATE TABLE IF NOT EXISTS "_weifuwu_migrations" (
        name TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)
  }

  mw.markMigrated = async (moduleName: string) => {
    await pool.unsafe(`INSERT INTO "_weifuwu_migrations" (name) VALUES ($1) ON CONFLICT DO NOTHING`, [
      moduleName,
    ])
  }

  mw.isMigrated = async (moduleName: string): Promise<boolean> => {
    const rows = await pool.unsafe(`SELECT 1 FROM "_weifuwu_migrations" WHERE name = $1`, [moduleName])
    return rows.length > 0
  }

  // 迁移面（DDL 唯一入口——recorded & idempotent：已迁移名跳过；业务查询禁 execute——
  // 一律算子（table/query builder）——表达力不足补算子/raw 片段，不补执行面）
  mw.runMigration = async (name: string, sql: string): Promise<void> => {
    if (await mw.isMigrated(name)) return
    await pool.unsafe(sql)
    await mw.markMigrated(name)
  }

  // 声明式 Schema 迁移（DDL 算子化：业务零 SQL 字符串——声明 → 框架内部生成 → 执行记录）
  mw.migrateModule = async (name: string, mod: import('../db/schema.ts').SchemaModule): Promise<void> => {
    // 真库：DDL AST → SQL 单向输出（compileSchemaDdl 产物永远经 ddlToSql——无文本回流）
    await mw.runMigration(name, ddlToSql(compileSchemaDdl(mod)))
  }

  // ORM 面事务（同连接——orm 内部走 adapter.transaction → pool 同连接）
  mw.transaction = orm.transaction as never

  mw.poolStats = () => ({ active: 0, idle: pool.size, waiting: 0, max: pool.size })

  // W3 一致性诊断：声明（orm 注册表）vs 实况（information_schema——diff 共用）
  mw.checkConsistency = async () => {
    const cols = await pool.unsafe(`
      SELECT table_name AS tbl, column_name AS col, data_type AS dt
      FROM information_schema.columns WHERE table_schema = current_schema()
    `)
    const liveMap = new Map<string, LiveTable>()
    for (const r of cols as Row[]) {
      const t = r.tbl as string
      if (!liveMap.has(t)) liveMap.set(t, { name: t, columns: [] })
      ;(liveMap.get(t) as LiveTable).columns.push({ name: r.col as string, type: r.dt as string })
    }
    return diffConsistency(orm.tables(), [...liveMap.values()])
  }

  mw.close = () => pool.close()

  return mw
}

/** PG 错误码 → HttpError 映射（框架默认，业务无需手写 catch） */

/** 内存模式 PostgresClient（测试——AST 直执行零 wire；DDL/迁移走 migrateModule AST 面） */
function createMemoryPostgres(opts: PostgresOptions = {}): PostgresClient {
  const mem = new MemorySql()
  const orm = createOrm(memoryAdapter(mem), opts.tenant)
  const applied = new Set<string>()
  const mw = ((req: Request, ctx: Context, next: Handler) => {
    ctx.orm = opts.tenant ? orm.withCtx(ctx) : orm
    return next(req, ctx)
  }) as unknown as PostgresClient
  mw.__meta = { injects: ['orm'], depends: [] }
  mw.orm = orm

  mw.migrate = async () => {
    // W3c：文本面删净——迁移表 DDL AST 化（协议层 = AST——memory 零 parse）
    mem.executeQuery({
      kind: 'ddl', op: 'createTable', table: '_weifuwu_migrations', ifNotExists: true,
      columns: [
        { name: 'name', type: 'TEXT', pk: true, unique: false, defaultNow: false, defaultUuid: false, nullable: false },
        { name: 'applied_at', type: 'TIMESTAMPTZ', pk: false, unique: false, defaultNow: true, defaultUuid: false, nullable: false },
      ],
    } as never)
  }
  mw.markMigrated = async (moduleName: string) => {
    applied.add(moduleName)
  }
  mw.isMigrated = async (moduleName: string): Promise<boolean> => {
    if (applied.has(moduleName)) return true
    try {
      const rows = mem.executeQuery({ kind: 'select', table: '_weifuwu_migrations', cols: ['name'], where: { name: { eq: moduleName } } } as never)
      return rows.length > 0
    } catch {
      return false // 迁移表未建（pg.migrate() 未跑）——视为未迁移（对齐真库测试残余语义）
    }
  }
  // runMigration（文本 DDL）——memory 面无（W3c parser 消亡）；迁移文本面归真库（DO 块
  // 判负——迁移面合法）；memory 无旧库态——migrateModule（AST）即全部
  mw.migrateModule = async <M extends SchemaModule>(name: string, mod: M): Promise<void> => {
    // memory：DDL AST 直执行（零 parse——协议层 = AST）
    for (const stmt of compileSchemaDdl(mod)) mem.executeQuery(stmt)
    if (!(await mw.isMigrated(name))) await mw.markMigrated(name)
  }
  mw.transaction = orm.transaction as never
  mw.poolStats = () => ({ active: 0, idle: 0, waiting: 0, max: 1 })
  // W3：memory 面一致性诊断（schemaSnapshot——同 diff 纯函数）
  mw.checkConsistency = async () => diffConsistency(orm.tables(), mem.schemaSnapshot())
  mw.close = async () => {}
  return mw
}

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
