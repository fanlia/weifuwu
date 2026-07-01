import type { Context, Middleware } from '../types.ts';
/**
 * Get all public environment variables (those prefixed with `WEIFUWU_PUBLIC_`),
 * with the prefix stripped.
 *
 * ```ts
 * const pub = getPublicEnv()
 * // WEIFUWU_PUBLIC_API_URL=http://api.example.com → { API_URL: 'http://api.example.com' }
 * ```
 */
export declare function getPublicEnv(): Record<string, string>;
declare module '../types.ts' {
    interface Context {
        env?: Record<string, string>;
    }
}
/**
 * Whether this code is running from the compiled `dist/index.js` bundle.
 * `false` when running TypeScript source directly (dev workflow in weifuwu repo).
 *
 * Used by modules that need to resolve package-internal files differently
 * depending on whether they are compiled (published npm package) or raw TS.
 */
export declare function isBundled(): boolean;
/**
 * Whether `NODE_ENV` is explicitly set to `'development'`.
 *
 * Used for dev-only features: HMR, livereload, React `createRoot` (not hydrate).
 * **Not** the opposite of {@link isProd} — when `NODE_ENV` is unset, both return `false`.
 */
export declare function isDev(): boolean;
/**
 * Whether `NODE_ENV` is explicitly set to `'production'`.
 *
 * Used for production-only behavior: plain-text 404, suppressed warnings, minified output.
 */
export declare function isProd(): boolean;
/**
 * Load environment variables from a `.env` file into `process.env`.
 *
 * Does **not** override existing `process.env` values.
 * Supports quoted values and inline comments.
 *
 * @param path - Path to `.env` file (default: `'.env'` relative to cwd).
 *
 * ```ts
 * import { loadEnv } from 'weifuwu'
 * loadEnv()
 * console.log(process.env.PORT)
 * ```
 */
export declare function loadEnv(path?: string): void;
/**
 * Public env middleware.
 *
 * Injects `ctx.env` with all environment variables prefixed with `WEIFUWU_PUBLIC_`,
 * with the prefix stripped. Safe to expose to the client.
 *
 * ```ts
 * import { env } from 'weifuwu'
 * app.use(env())
 *
 * // .env:  WEIFUWU_PUBLIC_API_URL=https://api.example.com
 * // ctx:   ctx.env.API_URL === 'https://api.example.com'
 * ```
 */
export declare function env(): Middleware<Context, Context & {
    env: Record<string, string>;
}>;
