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
import { ConnectionError } from '../errors.ts'

export interface PgPoolOptions extends PgConnectionOptions {
  /** 池大小（连接数）。默认 5。 */
  poolSize?: number
}

type QueryParams = (string | number | boolean | object | null)[]

export class PgPool {
  private available: PgConnection[] = []
  private waiters: { resolve: (conn: PgConnection) => void; reject: (e: unknown) => void }[] = []
  private closed = false

  private constructor() {}

  static async create(options: PgPoolOptions = {}): Promise<PgPool> {
    const poolSize = options.poolSize ?? 5
    const pool = new PgPool()
    pool.available = await Promise.all(
      Array.from({ length: poolSize }, async () => {
        const c = new PgConnection(options)
        await c.connect()
        return c
      }),
    )
    return pool
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

  async query(sql: string, params?: QueryParams): Promise<Row[]> {
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
    const pending = this.available
    this.available = []
    await Promise.all(pending.map((c) => c.close()))
    // 拒绝所有等待者
    const ws = this.waiters
    this.waiters = []
    for (const w of ws) w.reject(new ConnectionError('postgres: pool is closed'))
  }

  get size(): number {
    return this.available.length + this.waiters.length
  }
}
