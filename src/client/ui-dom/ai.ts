/**
 * weifuwu/ui-dom AI 解码器 — 消费 wf: 协议（docs/ai-contract.md）
 *
 * 协议的前端参考实现：POST → 解析 SSE → 按事件名分发回调。
 *
 * - 零依赖：fetch + ReadableStream + 自研 SSE 解析
 * - 未知事件透传不抛错（协议 §6）：x:* 走 onEvent，未订阅的跳过
 * - 事件录制（副产品）：record 开启时记录完整事件序列，可导出为测试 fixture
 * - trace 桥（协议 §7）：默认自动生成 X-Trace-Id 并随请求发送，
 *   后端以之作为 wf:message_start.id → 整个 agent run 一次搜完
 * - abort：handle.abort() 或外部 signal → 取消请求 → 后端断开 → provider 取消
 */

import type {
  WfApprovalRequest,
  WfDone,
  WfError,
  WfErrorCode,
  WfStreamEvent,
  WfToolCall,
  WfToolProgress,
  WfToolResult,
  WfUsage,
} from '../../server/ai/types.ts'

export interface AiStreamCallbacks {
  /** wf:token — 增量文本，直接 append */
  onToken?: (text: string) => void
  /** wf:tool_call — 完整工具调用（后端已聚合） */
  onToolCall?: (call: WfToolCall) => void
  /** wf:tool_result — ok:false 不代表会话结束 */
  onToolResult?: (result: WfToolResult) => void
  /** wf:tool_progress — 长任务进度 */
  onToolProgress?: (p: WfToolProgress) => void
  /** wf:step — 步骤可视化（agent 扩展） */
  onStep?: (s: { type: 'llm' | 'tool'; content?: string; toolCallId?: string; name?: string }) => void
  /** wf:approval_request — 渲染审批卡片 */
  onApproval?: (req: WfApprovalRequest) => void
  /** wf:usage — token 计数 */
  onUsage?: (u: WfUsage) => void
  /** wf:done — 收尾 */
  onDone?: (d: WfDone) => void
  /** wf:error — 错误即值，结构化降级 */
  onError?: (e: WfError) => void
  /** x:* 自定义事件透传兜底（协议 §6：框架不解释） */
  onEvent?: (name: string, data: unknown) => void
}

export interface AiStreamOptions extends AiStreamCallbacks {
  signal?: AbortSignal
  headers?: Record<string, string>
  /** 显式指定 traceId；默认自动生成（协议 §7） */
  traceId?: string
  /** 录制事件序列（调试/导出 fixture），默认开启，环形上限 1000 */
  record?: boolean
}

export interface AiStreamHandle {
  /** 取消请求（用户停止/组件卸载/导航跳走时调用） */
  abort: () => void
  /** 流结束（正常 done / error / abort 都 resolve） */
  done: Promise<void>
  /** 本次请求使用的 traceId（自动生成的也能拿到） */
  traceId: string
  /** 录制的事件序列（record: true 时） */
  events: WfStreamEvent[]
}

const RECORD_LIMIT = 1000

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
          // 非 JSON 忽略（陷阱清单 #6）
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
