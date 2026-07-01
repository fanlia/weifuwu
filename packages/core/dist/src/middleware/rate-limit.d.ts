import type { Redis, Context, Middleware, Closeable } from '../types.ts';
/** Options for {@link rateLimit}. */
export interface RateLimitOptions {
    /** Maximum requests within the window (default: 100). */
    max?: number;
    /** Window duration in ms (default: 60000 = 1 minute). */
    window?: number;
    /** Custom key function. Default: IP from `x-forwarded-for` or `x-real-ip` or `cf-connecting-ip`. */
    key?: (req: Request, ctx: Context) => string;
    /** Custom 429 response body." */
    message?: string;
    /** Store backend. `'memory'` (default) or `'redis'`. */
    store?: 'memory' | 'redis';
    /** Redis client (required when `store: 'redis'`). */
    redis?: Redis;
    /** Redis key prefix (default: `'ratelimit:'`). */
    prefix?: string;
}
/** Rate limit module — middleware + stats. */
export interface RateLimitModule extends Middleware<Context, Context>, Closeable {
    stats(): {
        store: string;
        entries?: number;
        maxEntries: number;
    };
}
/**
 * Rate limiting middleware (in-memory or Redis-backed).
 *
 * Limits requests per key (default: client IP) within a rolling window.
 * Returns 429 when the limit is exceeded, with `Retry-After` header.
 *
 * ```ts
 * import { rateLimit } from 'weifuwu'
 *
 * // In-memory (single process)
 * app.use(rateLimit({ max: 60, window: 60_000 }))
 *
 * // Redis-backed (multi-process)
 * import { Redis } from 'ioredis'
 * app.use(rateLimit({ store: 'redis', redis: new Redis(), max: 100 }))
 * ```
 */
export declare function rateLimit(options?: RateLimitOptions): RateLimitModule;
