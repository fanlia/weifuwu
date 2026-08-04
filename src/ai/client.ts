/**
 * weifuwu AI — OpenAI 兼容客户端（自研，零依赖）
 *
 * 协议（docs/ai-contract.md）的后端参考实现：把 provider 的
 * chat/completions 流归一化成 wf: 事件。
 *
 * - 零依赖：fetch + 自研 SSE 解析
 * - 默认 DeepSeek（baseUrl 可换 → 任意 OpenAI 兼容端点：Ollama/vLLM/Moonshot…）
 * - 错误映射：provider HTTP 状态/错误体 → WfErrorCode（错误即值）
 * - tool_calls 聚合：id 只在首 chunk（DeepSeek），后端聚合成完整 wf:tool_call
 * - abort：外部 signal + 客户端断开 → 取消 provider 请求
 *
 * 诚实裁剪（CS-05）：embeddings 不做（DeepSeek 无此 API）、
 * reasoning 事件不进 v1 协议（reasoning_content 仅随消息往返）。
 */

import { randomUUID } from 'node:crypto'
import { sseResponse, type WfEmitter } from './sse.ts'
import type { ChatMessage, ChatParams, ToolCall, WfErrorCode } from './types.ts'

// ── 类型 ─────────────────────────────────────────────────

export interface ChatChunk {
  id: string
  model: string
  choices: {
    index: number
    delta: {
      role?: string
      content?: string
      reasoning_content?: string
      tool_calls?: ToolCall[]
    }
    finish_reason: 'stop' | 'length' | 'tool_calls' | null
  }[]
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number }
}

export interface ChatResponse {
  id: string
  model: string
  choices: {
    index: number
    message: ChatMessage
    finish_reason: 'stop' | 'length' | 'tool_calls' | null
  }[]
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number }
}

/** 协议错误：chat() 非流式场景抛出，stream() 场景编码为 wf:error 事件 */
export class AiError extends Error {
  code: WfErrorCode
  constructor(code: WfErrorCode, message: string) {
    super(message)
    this.name = 'AiError'
    this.code = code
  }
}

export interface AiClientOptions {
  baseUrl: string
  apiKey: string
  defaultModel: string
}

export interface AiClient {
  /** 非流式对话（worker/后台场景） */
  chat(params: ChatParams, options?: { signal?: AbortSignal }): Promise<ChatResponse>
  /** 流式对话 → SSE Response（协议 §1.1），路由直接 return */
  stream(params: ChatParams, options?: { signal?: AbortSignal; traceId?: string }): Response
  /** 低层：app 完全控制事件序列（自定义 x:* 事件、HITL 等） */
  sse(run: (emit: WfEmitter) => Promise<void> | void, options?: { signal?: AbortSignal }): Response
}

// ── SSE 解析（provider 线协议）────────────────────────────

/** 从 provider 的 SSE 流逐块解析 JSON（partial chunk / UTF-8 边界安全） */
async function* parseProviderSse(stream: ReadableStream<Uint8Array>): AsyncGenerator<ChatChunk> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? '' // 末段可能不完整，保留
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith(':')) continue // 注释行
        const data = trimmed.startsWith('data: ') ? trimmed.slice(6) : trimmed
        if (data === '[DONE]') return
        try {
          yield JSON.parse(data) as ChatChunk
        } catch {
          // 非 JSON 行忽略（陷阱清单 #6）
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
}

// ── provider 错误映射 ────────────────────────────────────

async function providerError(res: Response): Promise<{ code: WfErrorCode; message: string }> {
  let message = ''
  try {
    const body = await res.json()
    message = body?.error?.message ?? JSON.stringify(body)
  } catch {
    message = await res.text().catch(() => '')
  }
  const status = res.status
  let code: WfErrorCode
  if (status === 401 || status === 403) code = 'auth_failed'
  else if (status === 429) code = 'rate_limited'
  else if (status >= 500) code = 'provider_error'
  else if (/context|token|length/i.test(message)) code = 'context_length'
  else if (status === 400) code = 'invalid_request'
  else code = 'provider_error'
  return { code, message: message || `provider error (${status})` }
}

// ── 客户端 ────────────────────────────────────────────────

export function createAiClient(opts: AiClientOptions): AiClient {
  const endpoint = `${opts.baseUrl.replace(/\/$/, '')}/chat/completions`
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${opts.apiKey}` }

  /** 聚合 provider 流式 tool_calls：id 只在首 chunk，arguments 分片拼接 */
  function aggregateToolCalls(chunks: ChatChunk[]): ToolCall[] {
    const calls: ToolCall[] = []
    for (const chunk of chunks) {
      const delta = chunk.choices[0]?.delta
      if (!delta?.tool_calls) continue
      for (const tc of delta.tool_calls) {
        if (tc.id) {
          calls.push(tc)
        } else if (calls.length > 0) {
          // 后续 chunk 无 id → 追加到最后一个（DeepSeek 行为）
          const last = calls[calls.length - 1]
          if (tc.function?.arguments) last.function.arguments += tc.function.arguments
        }
      }
    }
    return calls
  }

  async function chat(params: ChatParams, options?: { signal?: AbortSignal }): Promise<ChatResponse> {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({ ...params, model: params.model ?? opts.defaultModel, stream: false }),
      signal: options?.signal,
    })
    if (!res.ok) {
      const { code, message } = await providerError(res)
      throw new AiError(code, message)
    }
    return res.json() as Promise<ChatResponse>
  }

  function stream(params: ChatParams, options?: { signal?: AbortSignal; traceId?: string }): Response {
    const controller = new AbortController()
    // 外部 signal（req.signal）转发到内部 controller
    const external = options?.signal
    if (external) {
      if (external.aborted) controller.abort()
      else external.addEventListener('abort', () => controller.abort(), { once: true })
    }

    return sseResponse(
      async (emit) => {
        emit('wf:message_start', { id: options?.traceId ?? randomUUID() })

        let res: Response
        try {
          res = await fetch(endpoint, {
            method: 'POST',
            headers,
            body: JSON.stringify({ ...params, model: params.model ?? opts.defaultModel, stream: true }),
            signal: controller.signal,
          })
        } catch (err) {
          if (controller.signal.aborted) return // 断开/取消：静默收尾
          emit('wf:error', { code: 'provider_error', message: err instanceof Error ? err.message : String(err) })
          return
        }

        if (!res.ok) {
          const { code, message } = await providerError(res)
          emit('wf:error', { code, message })
          return
        }

        // 逐 chunk：token 增量直发；tool_calls 聚合后发；usage 有即发
        let content = ''
        const chunks: ChatChunk[] = []
        let usage: ChatResponse['usage']
        try {
          for await (const chunk of parseProviderSse(res.body!)) {
            if (controller.signal.aborted) return // 断开：静默收尾
            const delta = chunk.choices[0]?.delta
            if (delta?.content) {
              content += delta.content
              emit('wf:token', { text: delta.content })
            }
            if (delta?.tool_calls) chunks.push(chunk)
            if (chunk.usage) usage = chunk.usage
          }
        } catch (err) {
          if (controller.signal.aborted) return // 断开：静默收尾（不报错）
          emit('wf:error', { code: 'provider_error', message: err instanceof Error ? err.message : String(err) })
          return
        }

        const toolCalls = aggregateToolCalls(chunks)
        for (const tc of toolCalls) {
          emit('wf:tool_call', {
            id: tc.id,
            name: tc.function?.name ?? '',
            args: safeParseArgs(tc.function?.arguments ?? ''),
          })
        }

        if (usage) emit('wf:usage', usage)
        emit('wf:done', { content, usage })
      },
      { onAbort: () => controller.abort() },
    )
  }

  function sse(run: (emit: WfEmitter) => Promise<void> | void, options?: { signal?: AbortSignal }): Response {
    const controller = new AbortController()
    const external = options?.signal
    if (external) {
      if (external.aborted) controller.abort()
      else external.addEventListener('abort', () => controller.abort(), { once: true })
    }
    return sseResponse(run, { onAbort: () => controller.abort() })
  }

  return { chat, stream, sse }
}

/** 工具参数可能是 JSON 字符串；解析失败给空对象（不抛错） */
function safeParseArgs(raw: string): Record<string, unknown> {
  if (!raw) return {}
  try {
    return JSON.parse(raw) as Record<string, unknown>
  } catch {
    return {}
  }
}
