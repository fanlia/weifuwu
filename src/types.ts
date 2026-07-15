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
// Built-in middleware modules declare additional properties here.
// e.g. postgres/types.ts → `declare module '../types.ts' { interface Context { sql: SqlClient } }`
export interface WsContext {
  /** Per-connection state object */
  state: Record<string, unknown>
  /** Send JSON to this connection */
  json(data: unknown): void
  /** Join a room */
  join(room: string): void
  /** Leave a room */
  leave(room: string): void
  /** Broadcast to a room */
  sendRoom(room: string, data: unknown): void
}

export interface Context {
  params: Record<string, string>
  query: Record<string, string>
  mountPath?: string
  /** Currently authenticated user (set by user() or custom auth middleware). */
  user?: unknown
  /** Server-side data loaded for the current page (React SSR). */
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
