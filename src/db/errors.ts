/**
 * weifuwu/db — 统一错误模型
 *
 * 自研 postgres/redis 客户端共享的错误类型体系。
 * 目标：错误语义统一 → 业务层 catch 可编程（按 kind/code 决策）。
 *
 *   kind:          connection | protocol | timeout | validation | retryable
 *   code:          PG 错误码（如 23505 唯一冲突）或协议码
 */

export type DbErrorKind = 'connection' | 'protocol' | 'timeout' | 'validation' | 'retryable'

export class DbError extends Error {
  readonly kind: DbErrorKind
  readonly code?: string
  readonly cause?: unknown

  constructor(kind: DbErrorKind, message: string, options?: { code?: string; cause?: unknown }) {
    super(message)
    this.name = 'DbError'
    this.kind = kind
    this.code = options?.code
    this.cause = options?.cause
  }
}

/** 明确不支持的协议能力（诚实裁剪）：COPY 二进制、逻辑复制、集群、哨兵等 */
export class ProtocolError extends DbError {
  constructor(feature: string, message?: string) {
    super('protocol', message ?? `${feature} is not supported by weifuwu/db`, { code: 'UNSUPPORTED' })
    this.name = 'ProtocolError'
  }
}

/** 连接失败（含重连尝试次数） */
export class ConnectionError extends DbError {
  readonly attempts: number

  constructor(message: string, attempts = 1, cause?: unknown) {
    super('connection', message, { cause })
    this.name = 'ConnectionError'
    this.attempts = attempts
  }
}

/** 可重试错误：序列化失败/死锁（PG 40P01/40001）等 */
export class RetryableError extends DbError {
  constructor(message: string, code?: string, cause?: unknown) {
    super('retryable', message, { code, cause })
    this.name = 'RetryableError'
  }
}

/** 超时：statement_timeout / connect_timeout / idle 等 */
export class TimeoutError extends DbError {
  readonly operation: string
  readonly ms: number

  constructor(operation: string, ms: number) {
    super('timeout', `${operation} timed out after ${ms}ms`)
    this.name = 'TimeoutError'
    this.operation = operation
    this.ms = ms
  }
}

/** 写前校验失败（schema 注册 → 脏数据拦截） */
export class ValidationError extends DbError {
  constructor(message: string) {
    super('validation', message)
    this.name = 'ValidationError'
  }
}

/** 判断错误是否可安全重试（事务层用） */
export function isRetryable(err: unknown): boolean {
  return err instanceof RetryableError
}
