import { Router, type Context, type Middleware } from '@weifuwujs/core';
declare module '@weifuwujs/core' {
    interface Context {
        i18n: I18nInjected;
    }
}
export interface I18nInjected {
    locale: string;
    messages?: Record<string, unknown>;
    t: (key: string, params?: Record<string, string>, fallback?: string) => string;
    set?: (value: string, loc?: string) => Response;
}
export interface I18nOptions {
    /** Default locale (default: 'en'). */
    default?: string;
    /** Directory containing `{locale}.json` translation files. */
    dir?: string;
    /** Inline translation messages keyed by locale. */
    messages?: Record<string, Record<string, unknown>>;
    /** Cookie name for locale (default: 'locale'). Set empty to disable. */
    cookie?: string;
    /** Whether to detect locale from Accept-Language header (default: true). */
    fromAcceptLanguage?: boolean;
}
/**
 * i18n module. Returns a Router with an attached `.middleware()` method.
 *
 * ```ts
 * const l = i18n({ dir: './locales' })
 * app.use(l.middleware())  // → ctx.i18n = { locale, t, set }
 * app.use('/', l)          // → GET /__lang/:locale (switch route)
 * ```
 */
export interface I18nModule extends Router {
    /** Middleware that injects `ctx.i18n = { locale, t, set }`. */
    middleware: () => Middleware<Context, Context & I18nInjected>;
}
export declare function i18n(options?: I18nOptions): I18nModule;
