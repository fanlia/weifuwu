import type { Context, Middleware } from '../types.ts';
declare module '../types.ts' {
    interface Context {
        parsed: Record<string, unknown>;
    }
}
/** Upload middleware — a {@link Middleware} that injects `ctx.parsed` with file fields. */
export type UploadModule = Middleware<Context, Context & {
    parsed: Record<string, unknown>;
}>;
/** A parsed file from a multipart upload. */
export interface UploadedFile {
    /** Original filename from the client. */
    name: string;
    /** MIME type from the `Content-Type` part header. */
    type: string;
    /** File size in bytes. */
    size: number;
    /** Path where the file was saved (when `dir` option is set). */
    path?: string;
    /** File content as Buffer (when `dir` option is not set). */
    buffer?: Buffer;
}
/** Options for {@link upload}. */
export interface UploadOptions {
    /** Directory to save uploaded files. If not set, files stay in memory via `.buffer`. */
    dir?: string;
    /** Maximum file size in bytes. Default: 10 MB. Set `0` to allow unlimited. */
    maxFileSize?: number;
    /** Allowed MIME types (e.g. `['image/jpeg', 'image/png']`). Empty array allows all. */
    allowedTypes?: string[];
}
/**
 * Multipart file upload middleware.
 *
 * Parses `multipart/form-data` requests, extracting files and fields.
 * Files can be saved to disk (`dir` option) or kept in memory as Buffers.
 * Parsed fields are available in `ctx.parsed`.
 *
 * ```ts
 * import { upload } from 'weifuwu'
 *
 * // Save to disk
 * app.use(upload({ dir: './uploads', maxFileSize: 5_000_000 }))
 *
 * // In-memory
 * app.post('/upload', async (req, ctx) => {
 *   const file = ctx.parsed?.file as UploadedFile
 *   console.log(file.name, file.type, file.buffer!.length)
 * })
 * ```
 */
export declare function upload(options?: UploadOptions): Middleware<Context, Context & {
    parsed: Record<string, unknown>;
}>;
