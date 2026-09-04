import type { Context, Middleware, Closeable } from '../types.ts'
import type { Row } from '../db/contracts.ts'
import type { Orm } from '../db/orm.ts'

export interface PostgresInjected {
  /** 声明式 ORM（shape+operator+adapter——业务唯一数据入口；ctx.sql 已删除） */
  orm: import('../db/orm.ts').Orm
}

export interface PostgresOptions {
  /** 连接字符串（默认 DATABASE_URL） */
  connection?: string
  /** 内存模式（测试——AST 直执行零 wire：不建 PgPool——memorySql 直调） */
  memory?: boolean
  /** 池大小（连接数）。默认 10。 */
  max?: number
  /** 池全忙时 acquire 超时 ms（防饿死）。默认 30_000。0 = 无限。 */
  acquireTimeoutMs?: number
  /** 语句超时 ms（慢查询保护，会话级 SET statement_timeout）。默认 0 = 禁用。 */
  statementTimeoutMs?: number
  /** 查询观测钩子（慢查询日志/审计） */
  /** 查询观测钩子（慢查询日志/审计）；第 4 参数为请求级 traceId（x-trace-id 头，无则 undefined） */
  onQuery?: (query: string, durationMs: number, rowCount: number, traceId?: string) => void
  /** postgres.js 兼容名（= max） */
  poolSize?: number
  /** postgres.js 兼容名（= statementTimeoutMs） */
  statementTimeout?: number
  /** 连接超时 ms。默认 10_000。 */
  connect_timeout?: number
  signal?: AbortSignal
  closeTimeout?: number
  ssl?: boolean | Record<string, unknown>
  /** 空闲连接回收 ms（超时未使用的连接关闭，池容量收缩；下次需要时自动重建）。
   *  默认 0 = 禁用（峰值连接常驻——watch 重启叠加期易击穿 pg max_connections）。
   *  dev/长生命周期进程建议 30_000。 */
  idle_timeout?: number
}

export interface PostgresClient extends Middleware<Context, Context & PostgresInjected>, Closeable {
  /** 声明式 ORM（shape+operator+adapter——表绑定/校验/类型收窄/gql） */
  orm: Orm
  /** 测试/播种 SQL 面（协议层——tag 模板 + unsafe——业务禁 sql：唯一入口 orm；
   *  测试 build 表/播种/直查断言用——真库=pool 直通·memory=engine unsafe） */
  sql: {
    (strings: TemplateStringsArray, ...values: unknown[]): Promise<import('../db/contracts.ts').Row[]>
    unsafe(sql: string, params?: unknown[]): Promise<import('../db/contracts.ts').Row[]>
  }
  /** Creates the migration tracking table (_weifuwu_migrations). Called once at startup. */
  migrate: () => Promise<void>
  /** Record that a module's migration has been applied (idempotent). */
  markMigrated: (moduleName: string) => Promise<void>
  /** Check whether a module has already been migrated. */
  isMigrated: (moduleName: string) => Promise<boolean>
  /** 迁移面（DDL 唯一入口）：执行 + 记录（已迁移名跳过）。业务查询不 execute——全算子化。 */
  runMigration: (name: string, sql: string) => Promise<void>
  /** 声明式 Schema 迁移（SchemaModule → 生成 DDL → 执行+记录——业务零 SQL 字符串） */
  migrateModule: (name: string, mod: import('../db/schema.ts').SchemaModule) => Promise<void>
  /** ORM 面事务（fn 收 orm——含 orm.query/execute——连接级同连接） */
  transaction: <T>(fn: (orm: Orm) => Promise<T>, retryOpts?: { maxRetries?: number }) => Promise<T>
  /** Connection pool configuration summary. */
  poolStats: () => { active: number; idle: number; waiting: number; max: number }
  close: () => Promise<void>
}
