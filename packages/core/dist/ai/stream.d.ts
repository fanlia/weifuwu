import type { Context } from '../types.ts';
import { Router } from '../core/router.ts';
import type { AIProvider } from './provider.ts';
export type AIHandler = (req: Request, ctx: Context) => Record<string, unknown> | Promise<Record<string, unknown>>;
export declare const _ai: Record<string, any>;
/**
 * Create a streaming AI endpoint.
 *
 * @param handler - Returns options for `streamText` or `streamObject` (if `schema` is present).
 * @param provider - Optional AI provider. If provided and the handler does not return a `model`,
 *                   `provider.model()` is used as the default.
 */
export declare function aiStream(handler: AIHandler, provider?: AIProvider): Promise<Router>;
