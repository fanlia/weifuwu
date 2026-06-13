import { AsyncLocalStorage } from 'node:async_hooks'
import { randomUUID } from 'node:crypto'

export interface TraceContext {
  /** Unique identifier for the current request trace. */
  traceId: string
  /** Timestamp (ms since epoch) when the trace started. */
  startTime: number
}

const als = new AsyncLocalStorage<TraceContext>()

/**
 * Get the current request's trace ID.
 * Returns `undefined` when called outside a request context (e.g. at startup).
 *
 * ```ts
 * const traceId = currentTraceId()
 * log.info({ traceId }, 'request started')
 * ```
 */
export function currentTraceId(): string | undefined {
  return als.getStore()?.traceId
}

/**
 * Get the full current trace context ({ traceId, startTime }).
 * Returns `undefined` outside a request.
 */
export function currentTrace(): TraceContext | undefined {
  return als.getStore()
}

/**
 * Run a function inside a trace context.
 * Used internally by `serve()` for every incoming request.
 * If `incomingTraceId` is provided (e.g. from an `X-Trace-Id` header) it is reused;
 * otherwise a new UUID is generated.
 *
 * ```ts
 * const result = runWithTrace(req.headers.get('x-trace-id'), () => {
 *   return handleRequest(req)
 * })
 * ```
 *
 * @param incomingTraceId - Optional trace ID from upstream. Pass `null` to auto-generate.
 * @param fn - Function to execute within the trace scope.
 * @returns The return value of `fn`.
 */
export function runWithTrace<T>(
  incomingTraceId: string | null,
  fn: () => T,
): T {
  const traceId = incomingTraceId || randomUUID()
  const startTime = Date.now()
  return als.run({ traceId, startTime }, fn)
}

/**
 * Milliseconds elapsed since the current trace started.
 * Returns `0` if called outside a request context.
 *
 * ```ts
 * app.use(async (req, ctx, next) => {
 *   const res = await next(req, ctx)
 *   console.log('handled in', traceElapsed(), 'ms')
 *   return res
 * })
 * ```
 */
export function traceElapsed(): number {
  const ctx = als.getStore()
  if (!ctx) return 0
  return Date.now() - ctx.startTime
}
