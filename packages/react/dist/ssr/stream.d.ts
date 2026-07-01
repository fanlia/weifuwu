import type { Context } from '@weifuwujs/core';
/** Options for {@link streamResponse}. */
export interface StreamOpts {
    ctx: Context;
    base: string;
    tailwind?: {
        css: string;
        url: string;
    };
    isDev: boolean;
    status?: number;
    loaderData?: Record<string, unknown>;
}
export declare function readStream(stream: ReadableStream): Promise<string>;
/**
 * Create an HTML response from a React SSR stream.
 */
export declare function streamResponse(reactStream: ReadableStream, opts: StreamOpts, hydrationScript?: string): Response;
