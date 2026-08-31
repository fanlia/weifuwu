/**
 * weifuwu AI — SSE 编码器
 *
 * 把 `wf:` 事件流编码成 text/event-stream Response（协议 §1.1）。
 * 与 docs/ai-contract.md 对应。
 *
 * - 错误即值：run 内部抛错 → 编码为 wf:error 事件，而非断流
 * - abort：客户端断开（cancel）→ onAbort 回调（用于取消 provider 请求）
 */

export type WfEmitter = (name: string, data: unknown) => void

export interface SseResponseOptions {
  /** 客户端断开回调（取消上游请求） */
  onAbort?: () => void
  /**
   * 心跳间隔 ms（SSE 注释行 `: wf-heartbeat`——代理保活——A6 修复）：
   * 长工具执行零字节输出 → nginx proxy_read_timeout 断流；0 = 关。默认 15000。
   * 注释行是协议合法——前端解析器（无 data 行）自动跳过——零改动。
   */
  heartbeatMs?: number
}

/** 默认心跳间隔：15s */
const DEFAULT_HEARTBEAT_MS = 15_000

/**
 * 构造 SSE Response。run 收到 emit，负责输出完整事件序列。
 *
 * ```ts
 * return sseResponse(async (emit) => {
 *   emit('wf:message_start', { id })
 *   emit('wf:token', { text: '你好' })
 *   emit('wf:done', { content })
 * })
 * ```
 */
export function sseResponse(
  run: (emit: WfEmitter) => Promise<void> | void,
  options?: SseResponseOptions,
): Response {
  const encoder = new TextEncoder()
  const heartbeatMs = options?.heartbeatMs ?? DEFAULT_HEARTBEAT_MS
  let hbTimer: ReturnType<typeof setInterval> | undefined

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit: WfEmitter = (name, data) => {
        controller.enqueue(encoder.encode(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`))
      }
      if (heartbeatMs > 0) {
        hbTimer = setInterval(() => {
          try {
            controller.enqueue(encoder.encode(': wf-heartbeat\n\n'))
          } catch {
            // 已关闭——忽略（cancel 路径由 cancel() 清理）
          }
        }, heartbeatMs)
      }
      try {
        await run(emit)
        controller.close()
      } catch (err) {
        // 流级异常 → wf:error（错误即值，连接正常收尾）
        try {
          emit('wf:error', {
            code: 'provider_error',
            message: err instanceof Error ? err.message : String(err),
          })
          controller.close()
        } catch {
          controller.error(err)
        }
      } finally {
        if (hbTimer) {
          clearInterval(hbTimer)
          hbTimer = undefined
        }
      }
    },
    cancel() {
      if (hbTimer) {
        clearInterval(hbTimer)
        hbTimer = undefined
      }
      options?.onAbort?.()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      // A6 修复：nginx 等代理默认缓冲 SSE——禁用（流式正确性）
      'X-Accel-Buffering': 'no',
    },
  })
}
