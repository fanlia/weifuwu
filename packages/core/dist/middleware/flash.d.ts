import type { Context, Middleware } from '../types.ts';
declare module '../types.ts' {
    interface Context {
        flash: FlashInjected;
    }
}
/** Flash message module — a {@link Middleware} that injects `ctx.flash`. */
export type FlashModule = Middleware<Context, Context & FlashInjected>;
/** Options for {@link flash}. */
export interface FlashOptions {
    /**
     * Cookie name to store the flash message.
     * @default 'flash'
     */
    name?: string;
}
/**
 * Flash message object injected into `ctx.flash`.
 */
export interface FlashInjected {
    /**
     * The flash value read from the incoming cookie.
     * `undefined` if no flash cookie is present.
     * Automatically cleared after the response is sent.
     */
    value: unknown;
    /**
     * Set a flash message and return a 302 redirect response.
     *
     * @param data - Any JSON-serializable value to store as the flash message.
     * @param location - Redirect location (defaults to the `Referer` header).
     * @returns A 302 Response with a `Set-Cookie` header.
     */
    set: (data: unknown, location?: string) => Response;
}
/**
 * Flash message middleware — injects `ctx.flash`.
 *
 * @param options - Cookie name configuration.
 * @returns Middleware that injects `ctx.flash` (`FlashInjected`).
 */
export declare function flash(options?: FlashOptions): Middleware<Context, Context & {
    flash: FlashInjected;
}>;
