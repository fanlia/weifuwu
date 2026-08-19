/**
 * vdom hooks — ai-stream（流式 AI 工具——P2 组件迁移移植——零 ui-dom）
 *
 * wf: SSE 协议流式解析（event: <name> / data: <json> 块）——分发到
 * onToken/onToolCall/onApproval 等回调——AbortController 取消——
 * onError 统一（HTTP 状态映射/网络失败/解析失败）——provider 协议
 * 类型来自 server/ai/types（服务端同源契约）。
 *
 * 组件消费（SheetGrid/SlideCanvas/Editor——AI 公式/生成）——
 * 非公共面（内部路径导入——公共面保持 h/jsx/uiServe/UIRouter）。
 */

import type {
  WfApprovalRequest, WfDone, WfError, WfErrorCode, WfStreamEvent,
  WfToolCall, WfToolProgress, WfToolResult, WfUsage,
} from '../../../server/ai/types.ts'

/** 事件回调面（组件消费） */
export interface AiStreamCallbacks {
  onToken?: (text: string) => void
  onToolCall?: (call: WfToolCall) => void
  onToolResult?: (result: WfToolResult) => void
  onToolProgress?: (p: WfToolProgress) => void
  onStep?: (step: { type: 'llm' | 'tool'; content?: string; toolCallId?: string; name?: string }) => void
  onApproval?: (req: WfApprovalRequest) => void
  onUsage?: (u: WfUsage) => void
  onDone?: (d: WfDone) => void
  onError?: (e: WfError) => void
  /** 未知/x:* 事件兜底 */
  onEvent?: (name: string, data: unknown) => void
}

export interface AiStreamOptions extends AiStreamCallbacks {
  headers?: Record<string, string>
  signal?: AbortSignal
  traceId?: string
  /** 事件记录（record 开关——默认开——RECORD_LIMIT 环） */
  record?: boolean
}

export interface AiStreamHandle {
  abort(): void
  done: Promise<void>
  traceId: string
  events: WfStreamEvent[]
}

const RECORD_LIMIT = 500

/** wf: SSE 流式请求（POST——事件回调分发——Abort 取消） */
export function aiStream(url: string, body: unknown, options?: AiStreamOptions): AiStreamHandle {
  const controller = new AbortController()
  const external = options?.signal
  if (external) {
    if (external.aborted) controller.abort()
    else external.addEventListener('abort', () => controller.abort(), { once: true })
  }

  const traceId = options?.traceId ?? randomId()
  const record = options?.record !== false
  const events: WfStreamEvent[] = []

  const done = (async () => {
    let res: Response
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Trace-Id': traceId,
          Accept: 'text/event-stream',
          ...options?.headers,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      })
    } catch (err) {
      if (controller.signal.aborted) return // 主动取消：静默
      options?.onError?.({ code: 'provider_error', message: err instanceof Error ? err.message : String(err) })
      return
    }

    if (!res.ok) {
      options?.onError?.({
        code: httpErrorCode(res.status),
        message: `HTTP ${res.status} ${res.statusText}`,
      })
      return
    }

    // 解析 wf: SSE 事件并分发
    try {
      for await (const { name, data } of parseWfEvents(res.body!)) {
        if (controller.signal.aborted) return
        pushEvent(events, { name, data } as WfStreamEvent, record)
        dispatch(name, data, options ?? {})
      }
    } catch (err) {
      if (controller.signal.aborted) return
      options?.onError?.({ code: 'provider_error', message: err instanceof Error ? err.message : String(err) })
    }
  })()

  return {
    abort: () => controller.abort(),
    done,
    traceId,
    events,
  }
}

/** 按事件名分发到对应回调；x:* 与未知事件走 onEvent（无 onEvent 则忽略，不抛错） */
function dispatch(name: string, data: unknown, o: AiStreamOptions): void {
  switch (name) {
    case 'wf:token': return o.onToken?.((data as { text: string }).text)
    case 'wf:tool_call': return o.onToolCall?.(data as WfToolCall)
    case 'wf:tool_result': return o.onToolResult?.(data as WfToolResult)
    case 'wf:tool_progress': return o.onToolProgress?.(data as WfToolProgress)
    case 'wf:step': return o.onStep?.(data as { type: 'llm' | 'tool'; content?: string; toolCallId?: string; name?: string })
    case 'wf:approval_request': return o.onApproval?.(data as WfApprovalRequest)
    case 'wf:usage': return o.onUsage?.(data as WfUsage)
    case 'wf:done': return o.onDone?.(data as WfDone)
    case 'wf:error': return o.onError?.(data as WfError)
    default: return o.onEvent?.(name, data)
  }
}

/** 解析 wf: SSE：event: <name>\ndata: <json> 块 */
async function* parseWfEvents(stream: ReadableStream<Uint8Array>): AsyncGenerator<{ name: string; data: unknown }> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const blocks = buffer.split('\n\n')
      buffer = blocks.pop() ?? '' // 末块可能不完整，保留
      for (const block of blocks) {
        let name = 'message'
        let data = ''
        for (const line of block.split('\n')) {
          if (line.startsWith('event: ')) name = line.slice(7)
          else if (line.startsWith('data: ')) data += line.slice(6)
        }
        if (!data) continue
        try {
          yield { name, data: JSON.parse(data) }
        } catch {
          // 非 JSON 忽略
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
}

function pushEvent(events: WfStreamEvent[], e: WfStreamEvent, record: boolean): void {
  if (!record) return
  if (events.length >= RECORD_LIMIT) events.shift()
  events.push(e)
}

function httpErrorCode(status: number): WfErrorCode {
  if (status === 401 || status === 403) return 'auth_failed'
  if (status === 429) return 'rate_limited'
  if (status >= 500) return 'provider_error'
  return 'invalid_request'
}

/** 浏览器/Node 都可用：crypto.randomUUID 兜底 */
function randomId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `trace-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}
