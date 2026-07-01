import type { ZodSchema } from 'zod';
import type { Middleware } from '../types.ts';
declare module '../types.ts' {
    interface Context {
        parsed: Record<string, unknown>;
    }
}
/** Validation middleware — a {@link Middleware} that injects `ctx.parsed` with validated data. */
export type ValidateModule = Middleware;
export interface ValidationSchemas {
    body?: ZodSchema;
    query?: ZodSchema;
    params?: ZodSchema;
    headers?: ZodSchema;
}
/**
 * Request validation middleware using Zod schemas.
 *
 * Validates `params`, `query`, `body`, and/or `headers` against schemas.
 * Returns 422 with error details on mismatch.
 * Injects `ctx.parsed` with validated-and-transformed values.
 *
 * ```ts
 * import { z } from 'zod'
 *
 * app.get('/users/:id', validate({
 *   params: z.object({ id: z.string() }),
 *   query: z.object({ include: z.string().optional() }),
 * }), handler)
 * ```
 */
export declare function validate(schemas?: ValidationSchemas): Middleware;
