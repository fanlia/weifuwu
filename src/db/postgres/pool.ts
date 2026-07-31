/**
 * weifuwu/db/postgres — PostgreSQL 连接池（借贷模型）
 *
 * 连接空闲队列 + 等待者队列：
 *   query  → acquire（空闲连接 or 等待）→ 执行 → release
 *   事务   → acquire 单个连接执行整个 BEGIN→fn→COMMIT/ROLLBACK
 *
 * 解决 PgConnection 单连接串行（一个 currentQuery）的限制：
 * 并发查询路由到不同连接，全忙时排队等待而非 reject。
 */

import { PgConnection, type PgConnectionOptions, type Row } from './connection.ts'
import { ConnectionError, ValidationError } from '../errors.ts'
import { validateRow, type Schema } from './schema.ts'

export interface PgPoolOptions extends PgConnectionOptions {
  /** 池大小（连接数）。默认 5。 */
  poolSize?: number
  /** 查询观测钩子（慢查询日志/审计） */
  onQuery?: (sql: string, durationMs: number, rowCount: number) => void
}

type QueryParams = (string | number | boolean | object | null)[]

export class PgPool {
  private all: PgConnection[] = []
  private available: PgConnection[] = []
  private waiters: { resolve: (conn: PgConnection) => void; reject: (e: unknown) => void }[] = []
  private closed = false
  private opts: PgPoolOptions
  private initPromise: Promise<void> | null = null
  private schemas = new Map<string, Schema>()

  /** 懒连接：构造不连接，ensure() 首次初始化（中间件注入场景） */
  constructor(options: PgPoolOptions = {}) {
    this.opts = options
  }

  static async create(options: PgPoolOptions = {}): Promise<PgPool> {
    const pool = new PgPool(options)
    await pool.ensure()
    return pool
  }

  private ensure(): Promise<void> {
    if (this.all.length > 0) return Promise.resolve()
    if (!this.initPromise) {
      this.initPromise = this.init()
    }
    return this.initPromise
  }

  private async init(): Promise<void> {
    const poolSize = this.opts.poolSize ?? 5
    const conns = await Promise.all(
      Array.from({ length: poolSize }, async () => {
        const c = new PgConnection(this.opts)
        await c.connect()
        return c
      }),
    )
    this.all = conns
    this.available = [...conns]
  }

  /** 获取一个空闲连接（全忙则排队等待） */
  private acquire(): Promise<PgConnection> {
    if (this.closed) return Promise.reject(new ConnectionError('postgres: pool is closed'))
    if (this.available.length > 0) {
      return Promise.resolve(this.available.pop()!)
    }
    return new Promise((resolve, reject) => this.waiters.push({ resolve, reject }))
  }

  private release(conn: PgConnection) {
    if (this.closed) {
      conn.close()
      return
    }
    const waiter = this.waiters.shift()
    if (waiter) {
      waiter.resolve(conn) // 直接交给等待者，无需回池
    } else {
      this.available.push(conn)
    }
  }

  async query<T = Row>(sql: string, params?: QueryParams): Promise<T[]> {
    await this.ensure()
    const conn = await this.acquire()
    const start = performance.now()
    try {
      const rows = await conn.query(sql, params)
      this.opts.onQuery?.(sql, performance.now() - start, rows.length)
      return rows as T[]
    } finally {
      this.release(conn)
    }
  }

  /** 注册表结构（元数据闭环：校验/类型推断的起点） */
  register(table: string, schema: Schema): void {
    this.schemas.set(table, schema)
  }

  /** 写前校验 + 参数化插入（schema 驱动，脏数据源头拦截） */
  async insert<T = Row>(table: string, row: Record<string, unknown>): Promise<T[]> {
    const schema = this.schemas.get(table)
    if (!schema) {
      throw new ValidationError(`schema: table '${table}' not registered—call register() first`)
    }
    validateRow(schema, row)
    const cols = Object.keys(row)
    if (cols.length === 0) throw new ValidationError('schema: insert requires at least one column')
    const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ')
    const sql = `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${placeholders})`
    return this.query<T>(sql, cols.map((c) => row[c]) as QueryParams)
  }

  /**
   * tagged template: sql\`SELECT * FROM t WHERE id = \${id}\`
   * 插值 = 参数（postgres.js 语义，防注入）；表名必须硬编码（插值会被当参数）。
   * 对象插值自动 JSON.stringify → jsonb。
   */
  tag(strings: TemplateStringsArray, ...values: unknown[]): Promise<Row[]> {
    const { sql, params } = parseTagged(strings, values)
    return this.query(sql, params)
  }

  /** postgres.js 兼容事务 API: begin(fn)——fn 收到 tagged template 事务 sql */
    async begin<T>(fn: (txSql: TaggedSql) => Promise<T>): Promise<T> {
    await this.ensure()
    
    return this.transaction(async (tx) => {
      const txSql: TaggedSql = (strings: TemplateStringsArray, ...values: unknown[]) => {
        const { sql, params } = parseTagged(strings, values)
        return tx.query(sql, params)
      }
      return fn(txSql)
    })
  }

  /** 原生 SQL（DDL / 动态表名场景）；$1 占位符 + 参数数组 */
  async unsafe(sql: string, params?: QueryParams): Promise<Row[]> {
    await this.ensure()
    const conn = await this.acquire()
    try {
      return await conn.query(sql, params)
    } finally {
      this.release(conn)
    }
  }

  /** 事务：固定在单个连接上执行整个 BEGIN→fn→COMMIT/ROLLBACK */
  async transaction<T>(
    fn: (tx: { query: (sql: string, params?: QueryParams) => Promise<Row[]> }) => Promise<T>,
  ): Promise<T> {
    await this.ensure()
    const conn = await this.acquire()
    try {
      await conn.query('BEGIN')
      try {
        const result = await fn({ query: (sql, params) => conn.query(sql, params) })
        await conn.query('COMMIT')
        return result
      } catch (e) {
        await conn.query('ROLLBACK').catch(() => {})
        throw e
      }
    } finally {
      this.release(conn)
    }
  }

  async close(): Promise<void> {
    this.closed = true
    this.available = []
    // 关闭所有连接（含被借出的）——借贷池关闭不留泄漏
    await Promise.all(this.all.map((c) => c.close()))
    this.all = []
    // 拒绝所有等待者
    const ws = this.waiters
    this.waiters = []
    for (const w of ws) w.reject(new ConnectionError('postgres: pool is closed'))
  }

  get size(): number {
    return this.available.length + this.waiters.length
  }
}

/** tagged template → 参数化 SQL（插值 = 参数） */
function parseTagged(strings: TemplateStringsArray, values: unknown[]): { sql: string; params: QueryParams } {
  const sql = strings.reduce(
    (acc, s, i) => acc + s + (i < values.length ? `$${i + 1}` : ''),
    '',
  )
  return { sql, params: values as QueryParams }
}

/** tagged template 事务 sql（begin 回调参数） */
export type TaggedSql = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<Row[]>
