import type { Middleware, Context } from '../types.ts';
export interface LoggerOptions {
    /** 'short' = method + path + status + ms, 'combined' = short + query string, 'json' = structured stderr JSON */
    format?: 'short' | 'combined' | 'json';
}
export interface LogEvent {
    level: 'info' | 'warn' | 'error';
    message: string;
    method?: string;
    path?: string;
    status?: number;
    elapsed_ms?: number;
    traceId?: string;
    timestamp?: string;
}
export declare function logger(options?: LoggerOptions): Middleware<Context, Context>;
