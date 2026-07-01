import type { Context, Middleware } from '../types.ts';
declare module '../types.ts' {
    interface Context {
        trace: TraceInjected;
    }
}
export interface TraceInjected {
    /** Unique request identifier (from X-Request-ID header or auto-generated). */
    requestId: string;
    /** Unique trace identifier for the request. */
    traceId: string;
    /** Milliseconds elapsed since the trace started. */
    elapsed: () => number;
    /** Timestamp (ms) when the trace started. */
    startTime: number;
}
export interface TraceContext {
    /** Unique identifier for the current request trace. */
    traceId: string;
    /** Timestamp (ms since epoch) when the trace started. */
    startTime: number;
}
/**
 * Get the current request's trace ID.
 * Returns `undefined` when called outside a request context (e.g. at startup).
 *
 * ```ts
 * const traceId = currentTraceId()
 * log.info({ traceId }, 'request started')
 * ```
 */
export declare function currentTraceId(): string | undefined;
/**
 * Get the full current trace context ({ traceId, startTime }).
 * Returns `undefined` outside a request.
 */
export declare function currentTrace(): TraceContext | undefined;
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
export declare function runWithTrace<T>(incomingTraceId: string | null, fn: () => T): T;
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
export declare function traceElapsed(): number;
/** Options for {@link trace}. */
export interface TraceOptions {
    /** Header name for request ID (default: `'X-Request-ID'`). */
    header?: string;
    /** Custom ID generator (default: `crypto.randomUUID`). */
    generator?: () => string;
}
/**
 * Request tracing middleware.
 *
 * Injects `ctx.trace = { requestId, traceId, elapsed, startTime }`.
 * Reads/writes `X-Request-ID` header. Combines the functionality of `requestId()`
 * with the per-request tracing from `AsyncLocalStorage`.
 *
 * ```ts
 * import { trace } from 'weifuwu'
 * app.use(trace())
 *
 * app.get('/', (req, ctx) => {
 *   console.log(ctx.trace.requestId)  // 550e8400-e29b-...
 *   console.log(ctx.trace.traceId)    // same as currentTraceId()
 *   console.log(ctx.trace.elapsed())  // ms since request start
 * })
 * ```
 */
export declare function trace(options?: TraceOptions): Middleware<Context, Context & {
    trace: TraceInjected;
}>;
