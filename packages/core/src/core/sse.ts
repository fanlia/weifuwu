const encoder = new TextEncoder()

/**
 * Format an SSE message string with a named event type.
 *
 * ```ts
 * formatSSE('ping', { ts: Date.now() })
 * // "event: ping\ndata: {"ts":...}\n\n"
 * ```
 */
export function formatSSE(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}

/**
 * Format an SSE message string with only a data line (no event type).
 *
 * ```ts
 * formatSSEData({ message: 'hello' })
 * // "data: {"message":"hello"}\n\n"
 * ```
 */
export function formatSSEData(data: unknown): string {
  return `data: ${JSON.stringify(data)}\n\n`
}

/** An SSE event to be sent via {@link createSSEStream}. */
export interface SSEEvent {
  /** Event type (maps to `event:` field). */
  event: string
  /** Event payload (serialized as JSON in `data:` field). */
  data: unknown
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
export function createSSEStream(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  iterable: AsyncIterable<any>,
  opts?: { headers?: Record<string, string>; status?: number },
): Response {
  return new Response(
    new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          for await (const event of iterable) {
            const text = event.type ? formatSSE(event.type, event) : formatSSEData(event)
            controller.enqueue(encoder.encode(text))
          }
        } catch (e: unknown) {
          if (e instanceof Error && e.name !== 'AbortError') {
            controller.enqueue(encoder.encode(formatSSE('error', { error: e.message })))
          }
        } finally {
          controller.close()
        }
      },
    }),
    {
      status: opts?.status ?? 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        ...opts?.headers,
      },
    },
  )
}
