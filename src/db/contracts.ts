/**
 * weifuwu/db — 自研数据库引擎契约层（接口与实现分离）
 *
 * 三个接口：消费方（ctx.sql / ctx.redis / 业务模块）只依赖接口类型，
 * 自研引擎（src/db/postgres|redis 的 class）实现它们：
 *
 *   PoolConnection     通用连接（pg/redis 池中连接项：生命周期 + 健康）
 *     ├─ PostgresPoolConnection  特化：参数化查询（PgConnection 实现）
 *     └─ RedisPoolConnection     特化：命令执行（RedisClient 实现）
 *   Sql                 SQL 标签模板（ctx.sql）——makeSql(PgPool) 实现
 *   Redis               Redis 命令面（ctx.redis）——RedisPool 实现
 *
 * 变更纪律（AGENTS.md §11 协议层）：改契约须 TDD 先行 + 真库验证（CS-04/CS-05）。
 */
import type { RespValue } from './redis/resp.ts'
import type { RedisPipeline } from './redis/pipeline.ts'
import type { RedisSubscriber } from './redis/subscriber.ts'

// ── 通用连接契约（pg/redis 共用） ─────────────────────────

/**
 * 连接池中的连接项（Postgres/Redis 通用）：生命周期 + 健康状态。
 * 各库特化（PostgresPoolConnection / RedisPoolConnection）扩展执行能力。
 */
export interface PoolConnection {
  /** 连接是否可用（就绪且未关闭） */
  readonly connected: boolean
  /** 关闭连接（幂等——重复 close 安全） */
  close(): Promise<void>
}

// ── Postgres 契约 ──────────────────────────────────────────

export interface Row {
  [col: string]: unknown
}

/** 查询结果：行数组 + 影响行数（INSERT/UPDATE/DELETE/MERGE 的 CommandComplete tag） */
export interface QueryResult<T = Row> extends Array<T> {
  affectedRows?: number
}

/** Postgres 连接（PoolConnection 特化：参数化查询） */
export interface PostgresPoolConnection extends PoolConnection {
  query(sql: string, params?: unknown[]): Promise<QueryResult>
}

/**
 * SQL 标签模板（ctx.sql）：`sql\`SELECT * FROM t WHERE id = ${id}\`` + 方法面。
 * callable tagged template → 参数化查询（$1 占位符）。
 */
export interface Sql {
  (strings: TemplateStringsArray, ...values: unknown[]): Promise<Row[]>
  /** 原生 SQL（DDL / 动态表名）；$1 占位符 + 参数 */
  unsafe(sql: string, params?: unknown[]): Promise<Row[]>
  /** 参数化查询 */
  query(sql: string, params?: unknown[]): Promise<Row[]>
  /** 事务（postgres.js 兼容）：回调收到 tagged template 事务 sql */
  begin<T>(fn: (sql: Sql) => Promise<T>): Promise<T>
  /** 事务（框架式）：回调收到 { query } */
  transaction<T>(
    fn: (tx: { query: (sql: string, params?: unknown[]) => Promise<Row[]> }) => Promise<T>,
  ): Promise<T>
  close(): Promise<void>
}

// ── Redis 契约 ─────────────────────────────────────────────

/** Redis 连接（PoolConnection 特化：命令执行） */
export interface RedisPoolConnection extends PoolConnection {
  command(name: string, ...args: (string | number)[]): Promise<RespValue>
}

/**
 * Redis 客户端（ctx.redis）：命令面（key 前缀 / 池轮询 / 断线自愈由引擎内部处理）。
 * 阻塞命令（BLPOP 等）在 commandTimeoutMs 超时时 resolve(null)（命令超时契约）。
 */
export interface Redis {
  /** 原始命令（RespValue 返回值——RESP 协议层；阻塞命令超时 resolve(null)） */
  command(name: string, ...args: (string | number)[]): Promise<RespValue>
  get(key: string): Promise<string | null>
  /** 二进制安全读取（原始字节，不解码） */
  getBuffer(key: string): Promise<Uint8Array | null>
  set(key: string, value: string | number, ttl?: number): Promise<'OK'>
  del(...keys: string[]): Promise<number>
  incr(key: string): Promise<number>
  expire(key: string, seconds: number): Promise<number>
  ttl(key: string): Promise<number>
  jsonGet(key: string): Promise<unknown | null>
  jsonSet(key: string, value: unknown, ttl?: number): Promise<'OK'>
  /** 读缓存：命中返回；未命中调 fn 填充（并发合并，单飞） */
  cache<T>(key: string, fn: () => Promise<T | null>, ttl: number): Promise<T | null>
  mget(...keys: string[]): Promise<(string | null)[]>
  mset(...kv: (string | number)[]): Promise<'OK'>
  exists(...keys: string[]): Promise<number>
  setnx(key: string, value: string | number): Promise<number>
  incrby(key: string, delta: number): Promise<number>
  hset(key: string, field: string, value: string | number): Promise<number>
  hget(key: string, field: string): Promise<string | null>
  hgetall(key: string): Promise<Record<string, string>>
  hdel(key: string, ...fields: string[]): Promise<number>
  lpush(key: string, ...values: (string | number)[]): Promise<number>
  rpush(key: string, ...values: (string | number)[]): Promise<number>
  lpop(key: string): Promise<string | null>
  rpop(key: string): Promise<string | null>
  lrange(key: string, start: number, stop: number): Promise<string[]>
  sadd(key: string, ...members: (string | number)[]): Promise<number>
  srem(key: string, ...members: (string | number)[]): Promise<number>
  smembers(key: string): Promise<string[]>
  zadd(key: string, score: number, member: string | number): Promise<number>
  zrange(key: string, start: number, stop: number): Promise<string[]>
  pipeline(): Promise<RedisPipeline>
  publish(channel: string, message: string | number): Promise<number>
  createSubscriber(): RedisSubscriber
  flushdb(): Promise<'OK'>
  close(): Promise<void>
}
