import type { Context, Middleware } from '../types.ts';
declare module '../types.ts' {
    interface Context {
        requestId: string;
    }
}
/** Options for {@link requestId}. */
/** Request ID module — a {@link Middleware} that injects `ctx.requestId`. */
export type RequestIdModule = Middleware<Context, Context & {
    requestId: string;
}>;
export interface RequestIdOptions {
    /** Header name for request ID (default: `'X-Request-ID'`). */
    header?: string;
    /** Custom ID generator (default: `crypto.randomUUID`). */
    generator?: () => string;
}
/**
 * Request ID middleware.
 *
 * @deprecated Use `trace()` from 'weifuwu' instead — it injects `ctx.trace.requestId`
 * along with `traceId` and `elapsed()` in a single middleware.
 *
 * ```ts
 * // Old:
 * app.use(requestId())
 * ctx.requestId
 *
 * // New:
 * app.use(trace())
 * ctx.trace.requestId
 * ```
 *
 * Reads an incoming `X-Request-ID` header (or custom header name) from the
 * request. If absent, generates a new UUID. Sets the response header and
 * injects `ctx.requestId`.
 */
export declare function requestId(options?: RequestIdOptions): Middleware<Context, Context & {
    requestId: string;
}>;
