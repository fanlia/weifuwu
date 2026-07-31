/**
 * SSE 流解析器 — 解析 DeepSeek Chat Completions SSE 流
 */

import type { ChatChunk } from './types.ts'

/**
 * 从 ReadableStream<Uint8Array> 中解析 SSE 事件，逐块抛出 ChatChunk
 */
export async function* parseSSEStream(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<ChatChunk> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      // 最后一段可能不完整，保留到下次
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith(':')) continue // 注释行

        if (trimmed.startsWith('data: ')) {
          const data = trimmed.slice(6)
          if (data === '[DONE]') return

          try {
            const chunk = JSON.parse(data) as ChatChunk
            yield chunk
          } catch {
            // 忽略非 JSON 行
          }
        }
      }
    }

    // 处理最后的 buffer
    if (buffer.trim()) {
      const line = buffer.trim()
      if (line.startsWith('data: ')) {
        const data = line.slice(6)
        if (data !== '[DONE]') {
          try {
            const chunk = JSON.parse(data) as ChatChunk
            yield chunk
          } catch { /* ignore */ }
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
}
