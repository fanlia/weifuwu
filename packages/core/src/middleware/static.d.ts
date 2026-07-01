import type { Handler } from '../types.ts';
/** Options for {@link serveStatic}. */
export interface ServeStaticOptions {
    /** Directory index filename (default: `'index.html'`). */
    index?: string;
    /** `Cache-Control max-age` in seconds. */
    maxAge?: number;
    /** Add `immutable` to `Cache-Control` (requires `maxAge`). */
    immutable?: boolean;
}
/**
 * Static file serving handler.
 *
 * Serves files from a root directory. Supports ETag/304, directory index,
 * Content-Type detection by extension, and directory traversal protection.
 *
 * ```ts
 * import { serveStatic, Router } from 'weifuwu'
 * const app = new Router()
 * app.get('/static/*', serveStatic('./public'))
 * ```
 */
export declare function serveStatic(root: string, options?: ServeStaticOptions): Handler;
