import { Router, type Context, type Middleware } from '@weifuwujs/core';
declare module '@weifuwujs/core' {
    interface Context {
        theme: ThemeInjected;
    }
}
export interface ThemeInjected {
    value: string;
    set: (value: string, loc?: string) => Response;
}
export interface ThemeOptions {
    /** Default theme value (default: 'system'). */
    default?: string;
    /** Cookie name (default: 'theme'). Set to empty string to disable cookie. */
    cookie?: string;
}
/**
 * Theme module. Returns a Router with an attached `.middleware()` method.
 *
 * ```ts
 * const t = theme()
 * app.use(t.middleware())  // → ctx.theme = { value, set }
 * app.use('/', t)          // → GET /__theme/dark (switch route)
 * ```
 */
export interface ThemeModule extends Router {
    /** Middleware that injects `ctx.theme = { value, set }`. */
    middleware: () => Middleware<Context, Context & ThemeInjected>;
}
export declare function theme(options?: ThemeOptions): ThemeModule;
