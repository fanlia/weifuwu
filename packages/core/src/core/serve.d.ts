import { type IncomingMessage, type ServerResponse } from 'node:http';
import type { Duplex } from 'node:stream';
import { type Handler } from '../types.ts';
import { Router } from './router.ts';
export interface ServeOptions {
    port?: number;
    hostname?: string;
    signal?: AbortSignal;
    websocket?: (req: IncomingMessage, socket: Duplex, head: Buffer) => void;
    /** Max request body size in bytes. Default: 10MB. Set to 0 for unlimited. */
    maxBodySize?: number;
    /** Socket timeout in ms (inactivity). Default: 30_000. */
    timeout?: number;
    /** Keep-Alive idle timeout in ms. Default: 5_000. */
    keepAliveTimeout?: number;
    /** Headers timeout in ms (must be > keepAliveTimeout). Default: 6_000. */
    headersTimeout?: number;
    shutdown?: boolean;
}
export interface Server {
    stop: (timeoutMs?: number) => Promise<void>;
    /** Alias for `stop()`. Prefer this for consistency with other modules. */
    close: (timeoutMs?: number) => Promise<void>;
    readonly port: number;
    readonly hostname: string;
    ready: Promise<void>;
}
/** Default max body size: 10MB. Set maxBodySize: 0 for unlimited. */
export declare const DEFAULT_MAX_BODY: number;
export declare function readBody(req: IncomingMessage, maxSize?: number): Promise<Buffer>;
export declare function createRequest(req: IncomingMessage, body: Buffer): [Request, Record<string, string>];
export declare function sendResponse(res: ServerResponse, response: Response, opts?: {
    traceId?: string | null;
}): Promise<void>;
export declare function createTestServer(handler: Handler, options?: ServeOptions): Promise<{
    server: Server;
    url: string;
}>;
export declare function serve(handler: Handler, options?: ServeOptions): Server;
export declare function serve(router: Router, options?: ServeOptions): Server;
