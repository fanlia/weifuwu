import type { Middleware } from '../types.ts';
/** Options for {@link compress}. */
export interface CompressOptions {
    /** Compression level (1-9, default: 6). */
    level?: number;
    /** Minimum response body size in bytes to compress (default: 1024). */
    threshold?: number;
}
/**
 * Response compression middleware (brotli, gzip, deflate).
 *
 * Automatically selects the best encoding based on `Accept-Encoding` header.
 * Skips compression for small responses, images, audio, video, and already-encoded responses.
 *
 * ```ts
 * import { compress } from 'weifuwu'
 * app.use(compress())
 * ```
 */
export declare function compress(options?: CompressOptions): Middleware;
