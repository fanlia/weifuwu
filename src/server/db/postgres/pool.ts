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

import { PgConnection, type PgConnectionOptions, type Row, type QueryResult } from './connection.ts'
import { ConnectionError, TimeoutError, ValidationError } from '../errors.ts'
import { validateRow, type Schema } from './schema.ts'

export interface PgPoolOptions extends PgConnectionOptions {
  /** 池大小（连接数）。默认 5。 */
  poolSize?: number
  /** acquire 超时 ms（池全忙时等待上限，防饿死）。默认 30_000。0 = 无限。 */
  acquireTimeoutMs?: number
  /** 空闲连接回收 ms（超时未使用的连接关闭，容量收缩；下次需要时自动重建）。默认 0 = 禁用。 */
  idleTimeoutMs?: number
  /** 查询观测钩子（慢查询日志/审计） */
  onQuery?: (sql: string, durationMs: number, rowCount: number) => void
}

type QueryParams = (string | number | boolean | object | null)[]

export class PgPool {
  private all: PgConnection[] = []
  private available: PgConnection[] = []
  private waiters: {
    resolve: (conn: PgConnection) => void
    reject: (e: unknown) => void
    timer?: NodeJS.Timeout
  }[] = []
  private closed = false
  private opts: PgPoolOptions
  private initPromise: Promise<void> | null = null
  private schemas = new Map<string, Schema>()
  private idleTimer: NodeJS.Timeout | null = null

  /** 懒连接：构造不连接，ensure() 首次初始化（中间件注入场景） */
  constructor(options: PgPoolOptions = {}) {
    this.opts = options
  }

  static async create(options: PgPoolOptions = {}): Promise<PgPool> {
    const pool = new PgPool(options)
    await pool.ensure()
    return pool
  }

  private readyPromise: Promise<void> | null = null

  private ensure(): Promise<void> {
    // 已就绪：返回缓存的 resolved promise（零分配）
    if (this.readyPromise) return this.readyPromise
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
    this.readyPromise = Promise.resolve()
    this.startIdleReaper()
  }

  /** 空闲回收定时器（idleTimeoutMs > 0 时启动；unref 不阻塞进程退出） */
  private startIdleReaper(): void {
    const ms = this.opts.idleTimeoutMs ?? 0
    if (ms <= 0 || this.idleTimer) return
    this.idleTimer = setInterval(() => this.reapIdle(), ms)
    this.idleTimer.unref?.()
  }

  /** 扫描空闲连接：超时未使用 → close + 从池移除（容量收缩；acquire 时自动重建） */
  private reapIdle(): void {
    if (this.closed) return
    const now = Date.now()
    const ms = this.opts.idleTimeoutMs ?? 0
    for (let i = this.available.length - 1; i >= 0; i--) {
      const conn = this.available[i]
      if (conn.lastUsed > 0 && now - conn.lastUsed >= ms) {
        this.available.splice(i, 1)
        const idx = this.all.indexOf(conn)
        if (idx >= 0) this.all.splice(idx, 1)
        conn.close()
      }
    }
  }

  /** 当前打开的连接数（含借出；测试/观测用） */
  get open(): number {
    return this.all.length
  }

  /** 获取一个空闲连接（全忙则排队等待；池被空闲回收收缩时自动新建恢复容量） */
  private acquire(): Promise<PgConnection> {
    if (this.closed) return Promise.reject(new ConnectionError('postgres: pool is closed'))
    if (this.available.length > 0) {
      return Promise.resolve(this.available.pop()!)
    }
    // 容量被空闲回收收缩：新建连接补位（失败则排队等 replenish 重试）
    const poolSize = this.opts.poolSize ?? 5
    if (this.all.length < poolSize) {
      const c = new PgConnection(this.opts)
      return c.connect().then(
        () => {
          this.all.push(c)
          return c
        },
        () => {
          setTimeout(() => this.replenish(), 500)
          throw new ConnectionError('postgres: failed to establish connection')
        },
      )
    }
    const timeoutMs = this.opts.acquireTimeoutMs ?? 30_000
    return new Promise((resolve, reject) => {
      const waiter: { resolve: (conn: PgConnection) => void; reject: (e: unknown) => void; timer?: NodeJS.Timeout } = {
        resolve,
        reject,
      }
      if (timeoutMs > 0) {
        waiter.timer = setTimeout(() => {
          const idx = this.waiters.indexOf(waiter)
          if (idx >= 0) this.waiters.splice(idx, 1)
          reject(new TimeoutError('postgres: pool acquire', timeoutMs))
        }, timeoutMs)
      }
      this.waiters.push(waiter)
    })
  }

  private release(conn: PgConnection) {
    if (this.closed) {
      conn.close()
      return
    }
    if (!conn.connected) {
      // 坏连接（断线/被杀）——剔除并异步重建，防池容量萎缩
      conn.close()
      this.replenish()
      return
    }
    conn.lastUsed = Date.now()
    this.dispatchAvailable(conn)
  }

  /** 连接可用事件统一入口：优先唤醒等待者，否则回空闲池（release 与 replenish 共用） */
  private dispatchAvailable(conn: PgConnection) {
    const waiter = this.waiters.shift()
    if (waiter) {
      if (waiter.timer) clearTimeout(waiter.timer)
      waiter.resolve(conn) // 直接交给等待者，无需回池
    } else {
      this.available.push(conn)
    }
  }

  /** 坏连接剔除后异步重建（池容量保持）——就绪后走统一分发（唤醒 waiter） */
  private replenish(): void {
    if (this.closed) return
    const c = new PgConnection(this.opts)
    c.connect()
      .then(() => {
        if (this.closed) {
          c.close()
          return
        }
        this.all.push(c)
        this.dispatchAvailable(c)
      })
      .catch(() => {
        // 重建失败（DB 短暂不可达）：延迟重试，防池永久空
        setTimeout(() => this.replenish(), 500)
      })
  }

  async query<T = Row>(sql: string, params?: QueryParams): Promise<QueryResult<T>> {
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

  /**
   * 批量插入：多行 VALUES 单次往返（种子/批量写场景 N 往返 → 1）。
   * 诚实裁剪：所有行必须键集合一致（否则抛 ValidationError）；batchSize 分批（默认 500）。
   */
  async insertMany<T = Row>(
    table: string,
    rows: Record<string, unknown>[],
    opts: { batchSize?: number } = {},
  ): Promise<QueryResult<T>> {
    const empty = [] as QueryResult<T>
    if (rows.length === 0) {
      Object.defineProperty(empty, 'affectedRows', { value: 0, enumerable: false, writable: true })
      return empty
    }
    const schema = this.schemas.get(table)
    const keys = Object.keys(rows[0]).sort()
    const batchSize = Math.max(1, opts.batchSize ?? 500)
    let total = 0
    let last: QueryResult<T> = empty
    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize)
      for (let r = 0; r < batch.length; r++) {
        const row = batch[r]
        const rowKeys = Object.keys(row).sort()
        if (rowKeys.length !== keys.length || rowKeys.some((k, j) => k !== keys[j])) {
          throw new ValidationError(
            `schema: insertMany requires identical keys across rows (row ${i + r} has [${rowKeys}], expected [${keys}])`,
          )
        }
        if (schema) validateRow(schema, row)
      }
      const vals = batch
        .map((_, r) => `(${keys.map((_, c) => `$${r * keys.length + c + 1}`).join(', ')})`)
        .join(', ')
      const sql = `INSERT INTO ${table} (${keys.join(', ')}) VALUES ${vals}`
      const params = batch.flatMap((row) => keys.map((k) => row[k]))
      const r = await this.query<T>(sql, params as QueryParams)
      total += (r as QueryResult).affectedRows ?? batch.length
      if (r.length > 0) last = r
    }
    Object.defineProperty(last, 'affectedRows', { value: total, enumerable: false, writable: true })
    return last
  }

  /** 参数化 UPDATE：SET + WHERE 全部参数化（防注入）；返回 affectedRows；returning 可回读修改行 */
  async update<T = Row>(
    table: string,
    set: Record<string, unknown>,
    where: Record<string, unknown>,
    opts: { returning?: string[] } = {},
  ): Promise<QueryResult<T>> {
    const schema = this.schemas.get(table)
    if (schema) validateRow(schema, { ...set, ...where })
    const setCols = Object.keys(set)
    if (setCols.length === 0) throw new ValidationError('schema: update requires at least one SET column')
    const whereCols = Object.keys(where)
    if (whereCols.length === 0) {
      throw new ValidationError('schema: update requires a WHERE clause (full-table update via unsafe)')
    }
    const setSql = setCols.map((c, i) => `${c} = $${i + 1}`).join(', ')
    const whereSql = whereCols.map((c, i) => `${c} = $${setCols.length + i + 1}`).join(' AND ')
    const returning = opts.returning?.length ? ` RETURNING ${opts.returning.join(', ')}` : ''
    const sql = `UPDATE ${table} SET ${setSql} WHERE ${whereSql}${returning}`
    const params = [...setCols.map((c) => set[c]), ...whereCols.map((c) => where[c])]
    return this.query<T>(sql, params as QueryParams)
  }

  /** 参数化 DELETE：WHERE 参数化；返回 affectedRows。WHERE 必填（防全表误删） */
  async delete<T = Row>(table: string, where: Record<string, unknown>): Promise<QueryResult<T>> {
    const schema = this.schemas.get(table)
    if (schema) validateRow(schema, where)
    const whereCols = Object.keys(where)
    if (whereCols.length === 0) throw new ValidationError('schema: delete requires a WHERE clause')
    const sql = `DELETE FROM ${table} WHERE ${whereCols.map((c, i) => `${c} = $${i + 1}`).join(' AND ')}`
    return this.query<T>(sql, whereCols.map((c) => where[c]) as QueryParams)
  }

  /** 写前校验 + 参数化插入（schema 驱动，脏数据源头拦截） */
  async insert<T = Row>(table: string, row: Record<string, unknown>): Promise<QueryResult<T>> {
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
  tag(strings: TemplateStringsArray, ...values: unknown[]): Promise<QueryResult<Row>> {
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

  /** 片段：可嵌套的 SQL 片段（postgres.js fragment 语义，条件过滤模式） */
  frag(strings: TemplateStringsArray, ...values: unknown[]): SqlFragment {
    const { sql, params } = parseTagged(strings, values)
    return { __fragment: { sql, params } }
  }

  /** 原生 SQL（DDL / 动态表名场景）；$1 占位符 + 参数数组 */
  async unsafe(sql: string, params?: QueryParams): Promise<QueryResult<Row>> {
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
    fn: (tx: { query: (sql: string, params?: QueryParams) => Promise<QueryResult<Row>> }) => Promise<T>,
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
    if (this.idleTimer) {
      clearInterval(this.idleTimer)
      this.idleTimer = null
    }
    this.readyPromise = null
    this.available = []
    // 关闭所有连接（含被借出的）——借贷池关闭不留泄漏
    await Promise.all(this.all.map((c) => c.close()))
    this.all = []
    // 拒绝所有等待者
    const ws = this.waiters
    this.waiters = []
    for (const w of ws) {
      if (w.timer) clearTimeout(w.timer)
      w.reject(new ConnectionError('postgres: pool is closed'))
    }
  }

  get size(): number {
    return this.available.length + this.waiters.length
  }
}

/** 片段对象：嵌套 SQL 片段（内部含已解析的 sql + params） */
export interface SqlFragment {
  __fragment: { sql: string; params: QueryParams }
}

/**
 * tagged template → 参数化 SQL。
 * 插值 = 参数；插值是片段（SqlFragment）→ 内联其 SQL 并重编号参数。
 */
function parseTagged(strings: TemplateStringsArray, values: unknown[]): { sql: string; params: QueryParams } {
  let sql = strings[0]
  const params: QueryParams = []
  for (let i = 0; i < values.length; i++) {
    const frag = (values[i] as SqlFragment | undefined)?.__fragment
    if (frag) {
      // 片段内联：$N 重编号为当前参数序号
      const renumbered = frag.sql.replace(/\$(\d+)/g, (_m, idx: string) => {
        params.push(frag.params[parseInt(idx, 10) - 1] as never)
        return `$${params.length}`
      })
      sql += renumbered + strings[i + 1]
    } else {
      params.push(values[i] as never)
      sql += `$${params.length}` + strings[i + 1]
    }
  }
  return { sql, params }
}

/** tagged template 事务 sql（begin 回调参数） */
export type TaggedSql = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<QueryResult<Row>>
