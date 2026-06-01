import { formatSSE } from '../sse.ts'
import type { SSEManager, SSEEvent } from './types.ts'

interface StreamState {
  controller: ReadableStreamDefaultController<Uint8Array>
  encoder: TextEncoder
  closed: boolean
  buffer: Uint8Array[]
}

export function createSSEManager(): SSEManager {
  const streams = new Map<string, StreamState>()
  const encoder = new TextEncoder()

  function createStream(workflowId: string): ReadableStream<Uint8Array> {
    const state: StreamState = {
      controller: null!,
      encoder,
      closed: false,
      buffer: [],
    }

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        state.controller = controller
        streams.set(workflowId, state)

        for (const chunk of state.buffer) {
          try {
            controller.enqueue(chunk)
          } catch {
            break
          }
        }
        state.buffer = []
      },
      cancel() {
        state.closed = true
        streams.delete(workflowId)
      },
    })

    return stream
  }

  function send(workflowId: string, event: SSEEvent): void {
    const state = streams.get(workflowId)
    if (!state || state.closed) return

    const chunk = encoder.encode(formatSSE(event.event, event.data))

    if (state.controller) {
      try {
        state.controller.enqueue(chunk)
      } catch {
        state.closed = true
        streams.delete(workflowId)
      }
    } else {
      state.buffer.push(chunk)
    }
  }

  function close(workflowId: string): void {
    const state = streams.get(workflowId)
    if (!state) return

    state.closed = true
    streams.delete(workflowId)
    try {
      state.controller?.close()
    } catch {
      // Already closed
    }
  }

  return { createStream, send, close }
}
