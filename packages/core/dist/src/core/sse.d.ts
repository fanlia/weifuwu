/**
 * Format an SSE message string with a named event type.
 *
 * ```ts
 * formatSSE('ping', { ts: Date.now() })
 * // "event: ping\ndata: {"ts":...}\n\n"
 * ```
 */
export declare function formatSSE(event: string, data: unknown): string;
/**
 * Format an SSE message string with only a data line (no event type).
 *
 * ```ts
 * formatSSEData({ message: 'hello' })
 * // "data: {"message":"hello"}\n\n"
 * ```
 */
export declare function formatSSEData(data: unknown): string;
/** An SSE event to be sent via {@link createSSEStream}. */
export interface SSEEvent {
    /** Event type (maps to `event:` field). */
    event: string;
    /** Event payload (serialized as JSON in `data:` field). */
    data: unknown;
}
/**
 * Create a Server-Sent Events (SSE) `Response` from an async iterable.
 *
 * Each item in the iterable is serialized as an SSE message:
 * - If the item has a `.type` property → `event: {type}` + `data: {item}`
 * - Otherwise → `data: {item}`
 *
 * Errors are sent as `event: error` messages. `AbortError` is silently ignored.
 *
 * ```ts
 * app.get('/events', () => {
 *   async function* generate() {
 *     yield { type: 'ping', data: { ts: Date.now() } }
 *   }
 *   return createSSEStream(generate())
 * })
 * ```
 */
export declare function createSSEStream(iterable: AsyncIterable<any>, opts?: {
    headers?: Record<string, string>;
    status?: number;
}): Response;
