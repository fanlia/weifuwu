import type { Middleware, Context } from '../types.ts';
/** Options for {@link cors}. */
export interface CORSOptions {
    /** Allowed origin(s). Default `'*'`. If `credentials: true`, reflects the request origin. */
    origin?: string | string[] | ((origin: string) => string | boolean | undefined);
    /** Allowed HTTP methods. Default: `GET, HEAD, PUT, PATCH, POST, DELETE`. */
    methods?: string[];
    /** Allowed request headers. Default: `Content-Type, Authorization`. */
    allowedHeaders?: string[];
    /** Exposed response headers. */
    exposedHeaders?: string[];
    /** Whether to expose `Access-Control-Allow-Credentials`. */
    credentials?: boolean;
    /** `Access-Control-Max-Age` in seconds. */
    maxAge?: number;
}
/**
 * CORS middleware.
 *
 * ```ts
 * import { cors } from 'weifuwu'
 * app.use(cors({ origin: 'https://myapp.com', credentials: true }))
 * ```
 */
export declare function cors(options?: CORSOptions): Middleware<Context, Context>;
