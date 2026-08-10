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
 * SQL 标签模板（ctx.sql）：`sql\`SELECT * FROM t WHERE id = ${id}\`` + 方法面（YAGNI 精简）。
 * 事务能力走中间件面 `pg.transaction`（PostgresClient）——不在 Sql 接口。
 */
export interface Sql {
  (strings: TemplateStringsArray, ...values: unknown[]): Promise<Row[]>
  /** 原生 SQL（DDL / 动态表名）；$1 占位符 + 参数 */
  unsafe(sql: string, params?: unknown[]): Promise<Row[]>
  close(): Promise<void>
}

// ── Redis 契约 ─────────────────────────────────────────────

/** Redis 连接（PoolConnection 特化：命令执行） */
export interface RedisPoolConnection extends PoolConnection {
  command(name: string, ...args: (string | number)[]): Promise<RespValue>
}

/**
 * Redis 客户端（ctx.redis）：命令执行面（YAGNI 精简——消费方经 command 原始命令）。
 * 便捷方法（get/set/…）在需要时按需加回接口（MemoryRedis 保留完整实现供测试）。
 * 阻塞命令（BLPOP 等）在 commandTimeoutMs 超时时 resolve(null)（命令超时契约）。
 */
export interface Redis {
  /**
   * 创建独立连接（阻塞命令 / 专用通道——不占池连接，调用方负责 close）。
   * 引擎实现（RedisPool）用自身配置派生，无需调用方传 url/选项。
   */
  createConnection(): Promise<RedisPoolConnection>
  /** 原始命令（RespValue 返回值——RESP 协议层；阻塞命令超时 resolve(null)） */
  command(name: string, ...args: (string | number)[]): Promise<RespValue>
  /** 创建订阅者（Pub/Sub，独立连接——messager 跨进程广播用） */
  createSubscriber(): RedisSubscriber
  /** 发布消息到频道（订阅者回调触发） */
  publish(channel: string, message: string | number): Promise<number>
  /** 关闭（幂等） */
  close(): Promise<void>
}
