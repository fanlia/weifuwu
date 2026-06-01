const encoder = new TextEncoder()

export function formatSSE(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}

export function formatSSEData(data: unknown): string {
  return `data: ${JSON.stringify(data)}\n\n`
}

export interface SSEEvent {
  event: string
  data: unknown
}

export function createSSEStream(
  iterable: AsyncIterable<any>,
  opts?: { headers?: Record<string, string>; status?: number },
): Response {
  return new Response(
    new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          for await (const event of iterable) {
            const text = event.type
              ? formatSSE(event.type, event)
              : formatSSEData(event)
            controller.enqueue(encoder.encode(text))
          }
        } catch (e: any) {
          if (e.name !== 'AbortError') {
            controller.enqueue(
              encoder.encode(formatSSE('error', { error: e.message })),
            )
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
