import type { WebSocket, Context, Handler, Middleware, ErrorHandler } from '../types.ts';
import { type IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { type Hub } from '../hub.ts';
declare module '../types.ts' {
    interface Context {
        ws: {
            /** Per-connection state object */
            state: Record<string, unknown>;
            /** Send JSON to this connection */
            json(data: unknown): void;
            /** Join a room */
            join(room: string): void;
            /** Leave a room */
            leave(room: string): void;
            /** Broadcast to a room */
            sendRoom(room: string, data: unknown): void;
        };
    }
}
export type WebSocketHandler = {
    open?: (ws: WebSocket, ctx: Context) => void | Promise<void>;
    message?: (ws: WebSocket, ctx: Context, data: string | Buffer) => void | Promise<void>;
    close?: (ws: WebSocket, ctx: Context) => void | Promise<void>;
    error?: (ws: WebSocket, ctx: Context, error: Error) => void | Promise<void>;
};
type WsUpgradeHandler = (req: IncomingMessage, socket: Duplex, head: Buffer) => void;
export declare class Router<T extends Context = Context> {
    private root;
    private wsRoot;
    private globalMws;
    private errorHandler?;
    private _hasWildcard;
    private _hub?;
    private _wss?;
    /** Track which ctx fields have been injected so far (for dependency checking). */
    private _ctxFields;
    private get wss();
    private get hub();
    /** Inject a custom hub (e.g. with Redis for cross-process broadcast). */
    wsHub(hub: Hub): this;
    /** Global middleware — accumulates types into Router<T>. */
    use<Out extends Context>(mw: Middleware<Context, Out>): Router<T & Out>;
    /**
     * Mount a sub-router at the given path prefix.
     * All routes from the sub-router are registered with the prefix.
     *
     * ```ts
     * const admin = new Router()
     * admin.get('/dashboard', handler)
     * app.mount('/admin', admin)  // → GET /admin/dashboard
     * ```
     */
    mount(path: string, router: Router<Context>): Router<T>;
    /**
     * Check a middleware's dependency metadata and emit warnings if
     * required fields haven't been injected yet.
     * Attach __meta to a middleware function:
     *
     * ```ts
     * mw.__meta = { injects: ['sql'], depends: ['session'] }
     * ```
     */
    private _checkMiddlewareMeta;
    get(path: string, ...args: [...Middleware<T, T>[], Handler<T> | Router<Context>]): Router<T>;
    post(path: string, ...args: [...Middleware<T, T>[], Handler<T> | Router<Context>]): Router<T>;
    put(path: string, ...args: [...Middleware<T, T>[], Handler<T> | Router<Context>]): Router<T>;
    delete(path: string, ...args: [...Middleware<T, T>[], Handler<T> | Router<Context>]): Router<T>;
    patch(path: string, ...args: [...Middleware<T, T>[], Handler<T> | Router<Context>]): Router<T>;
    head(path: string, ...args: [...Middleware<T, T>[], Handler<T> | Router<Context>]): Router<T>;
    options(path: string, ...args: [...Middleware<T, T>[], Handler<T> | Router<Context>]): Router<T>;
    all(path: string, ...args: [...Middleware<T, T>[], Handler<T> | Router<Context>]): Router<T>;
    onError(handler: ErrorHandler<T>): Router<T>;
    private _route;
    /** Internal route registration — no type constraints (used by _mountRouter). */
    private _routeImpl;
    ws(path: string, ...args: [...Middleware<T, T>[], WebSocketHandler]): Router<T>;
    handler(): Handler<T>;
    /** Returns a human-readable list of all registered routes. Useful for debugging. */
    routes(): string[];
    private _collectRoutes;
    private _collectWsRoutes;
    websocketHandler(): WsUpgradeHandler;
    private _mountRouter;
    private _collect;
    private _collectWs;
    private splitPath;
    private matchTrie;
    private matchWsTrie;
    private handleError;
    private _notFoundResponse;
    private handle;
    private runChain;
}
export {};
