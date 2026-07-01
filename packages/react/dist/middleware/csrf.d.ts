import { type Context, type Middleware } from '@weifuwujs/core';
declare module '@weifuwujs/core' {
    interface Context {
        csrf: CsrfInjected;
    }
}
export interface CsrfInjected {
    token: string;
}
/** CSRF protection module — a {@link Middleware} that injects `ctx.csrf`. */
export type CsrfModule = Middleware<Context, Context & CsrfInjected>;
export interface CsrfOptions {
    /** Cookie name for CSRF token (default: `'_csrf'`). */
    cookie?: string;
    /** Request header name for CSRF token (default: `'x-csrf-token'`). */
    header?: string;
    /** Form body key for CSRF token (default: `'_csrf'`). */
    key?: string;
    /** HTTP methods to exclude from CSRF protection (default: `['GET', 'HEAD', 'OPTIONS']`). */
    excludeMethods?: string[];
}
/**
 * CSRF protection middleware.
 *
 * On excluded methods (GET, HEAD, OPTIONS), generates a token and stores it
 * in a cookie. On other methods, validates the token from header or body
 * against the cookie.
 *
 * Injects `ctx.csrf.token` for use in forms.
 */
export declare function csrf(options?: CsrfOptions): Middleware<Context, Context & CsrfInjected>;
