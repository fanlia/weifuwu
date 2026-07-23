import type postgres from 'postgres'

/** Untyped postgres.js SQL client. Use typed `Sql<{ table: { col: type } }>` for schemas. */
export type SqlClient = postgres.Sql<Record<string, unknown>>

/** Re-export for downstream usage. */
export type { Sql } from 'postgres'
/** Lightweight WebSocket interface for WS handler types (avoids external dep resolution). */
export interface WebSocket {
  send(data: string | Buffer): void
  close(code?: number, reason?: string): void
  ping(data?: unknown): void
  readyState: number
  readonly OPEN: number
  readonly CLOSED: number
  readonly CONNECTING: number
  readonly CLOSING: number
  on(event: string, handler: (...args: unknown[]) => void): this
  off(event: string, handler: (...args: unknown[]) => void): this
  addEventListener(event: string, handler: (...args: unknown[]) => void): void
  removeEventListener(event: string, handler: (...args: unknown[]) => void): void
}
export type { Redis, RedisOptions } from 'ioredis'

/** User injected by user() or custom auth middleware. */
export interface User {
  id: string
  role?: string
  tenant?: string
  [key: string]: unknown
}

// Context — extensible via module augmentation.

export interface Context {
  params: Record<string, string>
  query: Record<string, string>
  mountPath?: string
  /** Currently authenticated user (set by user() or custom auth middleware). */
  user?: unknown
  loaderData?: Record<string, unknown>
  /** Public environment variables. */
  env?: Record<string, string>
  [key: string]: unknown // allow arbitrary middleware-injected data
}

// Generic handler — T extends Context so middleware-injected properties are visible.
// Default T = Context means no generics needed for simple cases.
export type Handler<T extends Context = Context> = (
  req: Request,
  ctx: T,
) => Response | Promise<Response>

/**
 * Metadata for middleware dependency checking.
 * Middleware factories attach this for runtime validation.
 */
export interface MiddlewareMeta {
  /** Fields this middleware injects into ctx. */
  injects: string[]
  /** Fields this middleware depends on (must be injected earlier). */
  depends: string[]
}

// Generic middleware — In receives accumulated context from previous middlewares,
// Out adds new properties. next receives the enriched Out type.
// Default In = Out = Context means backward-compatible.
export type Middleware<In extends Context = Context, Out extends In = In> = {
  (req: Request, ctx: In, next: Handler<Out>): Response | Promise<Response>
  __meta?: MiddlewareMeta
}

export type ErrorHandler<T extends Context = Context> = (
  error: Error,
  req: Request,
  ctx: T,
) => Response | Promise<Response>

/**
 * Interface for resources that require explicit cleanup (connections, pools, timers).
 * All stateful modules implement this.
 */

export interface Closeable {
  /** Release all resources. Call once when shutting down. */
  close(): Promise<void>
}

/**
 * HTTP error with an explicit status code.
 * Throw from a handler or middleware to return a non-200 response.
 *
 * ```ts
 * if (!resource) throw new HttpError('Not found', 404)
 * serve() catches it and returns the status code.
 * ```
 */
export class HttpError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'HttpError'
    this.status = status
  }
}

/**
 * 类型安全的中间件工厂 — 减少中间件样板代码。
 *
 * 自动生成 `__meta`，自动类型推导注入字段。
 * 开发者仍需用 `declare module` 扩展 Context 接口以获得编译时类型检查。
 *
 * ```ts
 * declare module 'weifuwu' {
 *   interface Context { myField: string }
 * }
 *
 * const myMw = createMiddleware({
 *   injects: ['myField'],
 *   depends: ['sql'],
 *   setup: async (ctx) => {
 *     const result = await ctx.sql`SELECT ...`
 *     return { myField: result }
 *   },
 * })
 * ```
 */
export function createMiddleware<C extends Record<string, unknown>>(config: {
  /** 此中间件注入的字段名列表（用于 __meta） */
  injects: (keyof C)[]
  /** 此中间件依赖的字段名列表（必须已被前面的中间件注入） */
  depends?: string[]
  /** 初始化逻辑，返回要注入到 ctx 的值 */
  setup: (ctx: Context) => C | Promise<C>
}): Middleware<Context, Context & C> {
  const mw: Middleware = async (req, ctx, next) => {
    const injected = await config.setup(ctx)
    Object.assign(ctx, injected)
    return next(req, ctx)
  }
  mw.__meta = {
    injects: config.injects as unknown as string[],
    depends: config.depends ?? [],
  }
  return mw as Middleware<Context, Context & C>
}
