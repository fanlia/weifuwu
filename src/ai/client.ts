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
import type { ChatMessage, ChatParams, ToolCall, WfApprovalResponse, WfErrorCode } from './types.ts'

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
  /** embedding provider 配置（可选；未配时 embed/embedMany 抛 AiError('unsupported')） */
  embedding?: AiEmbeddingOptions
}

/** embedding provider 配置——默认参数与 DashScope compatible-mode 对齐（DeepSeek 无 embedding API） */
export interface AiEmbeddingOptions {
  /** 默认读 DASHSCOPE_API_KEY */
  apiKey?: string
  /** 默认 'https://dashscope.aliyuncs.com/compatible-mode/v1' */
  baseUrl?: string
  /** 默认读 DASHSCOPE_EMBEDDING_MODEL，回退 'text-embedding-v4' */
  defaultModel?: string
}

/** 单轮 LLM 流式调用的聚合结果（agent 循环用） */
export interface StreamFinishResult {
  content: string
  /** DeepSeek thinking 模式：必须随 assistant 消息回传（协议陷阱清单 #4） */
  reasoning_content?: string
  toolCalls: ToolCall[]
  usage?: ChatResponse['usage']
}

export interface AiClient {
  /** 非流式对话（worker/后台场景） */
  chat(params: ChatParams, options?: { signal?: AbortSignal }): Promise<ChatResponse>
  /** 流式对话 → SSE Response（协议 §1.1），路由直接 return */
  stream(params: ChatParams, options?: { signal?: AbortSignal; traceId?: string }): Response
  /** 低层：app 完全控制事件序列（自定义 x:* 事件、HITL 等） */
  sse(run: (emit: WfEmitter) => Promise<void> | void, options?: { signal?: AbortSignal }): Response
  /** 内部：单轮 LLM 流式 → emit 事件 + onFinish 聚合结果（agent 引擎用） */
  streamStep(
    params: ChatParams,
    opts: { emit: WfEmitter; signal?: AbortSignal; onFinish?: (r: StreamFinishResult) => void; emitUsage?: boolean },
  ): Promise<void>
  /** 响应一个挂起的 HITL 审批（协议 §4.5，app 的 POST /approve 路由调用） */
  approve(response: WfApprovalResponse): boolean
  /** 内部：agent 循环挂起等待审批 */
  waitApproval(
    req: { id: string; toolCallId: string; name: string; args: Record<string, unknown> },
    emit: WfEmitter,
    timeoutMs?: number,
  ): Promise<WfApprovalResponse>
  /** 单文本嵌入（知识库/语义检索；需 ai({ embedding }) 配置，未配抛 AiError） */
  embed(text: string): Promise<number[]>
  /** 批量文本嵌入（按输入顺序返回） */
  embedMany(texts: string[]): Promise<number[][]>
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

/**
 * DashScope 兼容 embedding 客户端（自研，零依赖）——默认参数与 agent-platform 对齐：
 *   model: DASHSCOPE_EMBEDDING_MODEL ?? 'text-embedding-v4'
 *   base:  DASHSCOPE_BASE_URL ?? 'https://dashscope.aliyuncs.com/compatible-mode/v1'
 * 未配 apiKey 时抛 AiError('auth_failed')（诚实裁剪：不静默降级/随机向量）。
 */
function createEmbeddingClient(ebd?: AiEmbeddingOptions) {
  const apiKey = ebd?.apiKey ?? process.env.DASHSCOPE_API_KEY ?? ''
  const configured = !!(ebd?.apiKey || process.env.DASHSCOPE_API_KEY)
  const baseUrl = ebd?.baseUrl ?? process.env.DASHSCOPE_BASE_URL ?? 'https://dashscope.aliyuncs.com/compatible-mode/v1'
  const defaultModel = ebd?.defaultModel ?? process.env.DASHSCOPE_EMBEDDING_MODEL ?? 'text-embedding-v4'
  const endpoint = `${baseUrl.replace(/\/$/, '')}/embeddings`
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` }

  async function embedMany(texts: string[]): Promise<number[][]> {
    if (!configured) {
      // 诚实裁剪：未配置 embedding provider（显式或 DASHSCOPE_API_KEY 都没有）→ 明确抛 unsupported
      throw new AiError('unsupported', 'ai embedding: 未配置——传 ai({ embedding }) 或设 DASHSCOPE_API_KEY（DeepSeek 无 embedding API，需独立 provider）')
    }
    if (!apiKey) {
      throw new AiError('auth_failed', 'ai embedding: DASHSCOPE_API_KEY 未设置')
    }
    // 3 秒超时：防止不可达的 API 长时间阻塞（对齐 agent-platform 行为）
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 3000)
    let res: Response
    try {
      res = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({ model: defaultModel, input: texts }),
        signal: controller.signal,
      })
    } catch (err) {
      if (controller.signal.aborted) throw new AiError('provider_error', 'embedding 请求超时（3s）')
      throw new AiError('provider_error', err instanceof Error ? err.message : String(err))
    } finally {
      clearTimeout(timer)
    }
    if (!res.ok) {
      const { code, message } = await providerError(res)
      throw new AiError(code, message)
    }
    const data = (await res.json()) as {
      data: Array<{ index: number; embedding: number[] }>
    }
    // 按 index 排序确保顺序与输入一致
    data.data.sort((a, b) => a.index - b.index)
    return data.data.map(item => item.embedding)
  }

  return {
    async embed(text: string): Promise<number[]> {
      const results = await embedMany([text])
      return results[0]
    },
    embedMany,
  }
}

export function createAiClient(opts: AiClientOptions): AiClient {
  const endpoint = `${opts.baseUrl.replace(/\/$/, '')}/chat/completions`
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${opts.apiKey}` }
  const embedding = createEmbeddingClient(opts.embedding)

  // ── HITL 审批注册表（协议 §4.5）：agent run 挂起 → app 的 POST /approve 响应 ──
  const approvals = new Map<string, (resp: WfApprovalResponse) => void>()

  function approve(response: WfApprovalResponse): boolean {
    const resolve = approvals.get(response.id)
    if (!resolve) return false
    approvals.delete(response.id)
    resolve(response)
    return true
  }

  /** 内部：agent 循环挂起等待审批（emit approval_request，直到 approve 响应或超时） */
  async function waitApproval(
    req: { id: string; toolCallId: string; name: string; args: Record<string, unknown> },
    emit: WfEmitter,
    timeoutMs = DEFAULT_APPROVAL_TIMEOUT,
  ): Promise<WfApprovalResponse> {
    const expiresAt = Date.now() + timeoutMs
    emit('wf:approval_request', { ...req, expiresAt })
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        if (approvals.has(req.id)) {
          approvals.delete(req.id)
          resolve({ id: req.id, decision: 'rejected' }) // 超时 → 按拒绝处理（协议 §4.5）
        }
      }, timeoutMs)
      approvals.set(req.id, (resp) => {
        clearTimeout(timer)
        resolve(resp)
      })
    })
  }
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
    const external = options?.signal
    if (external) {
      if (external.aborted) controller.abort()
      else external.addEventListener('abort', () => controller.abort(), { once: true })
    }

    return sseResponse(
      async (emit) => {
        emit('wf:message_start', { id: options?.traceId ?? randomUUID() })
        await streamStep(params, {
          emit,
          signal: controller.signal,
          onFinish: (r) => emit('wf:done', { content: r.content, usage: r.usage }),
        })
      },
      { onAbort: () => controller.abort() },
    )
  }

  /** 单轮 LLM 流式调用 → emit wf: 事件 + onFinish 聚合结果（agent 循环复用） */
  async function streamStep(
    params: ChatParams,
    stepOpts: { emit: WfEmitter; signal?: AbortSignal; onFinish?: (r: StreamFinishResult) => void; emitUsage?: boolean },
  ): Promise<void> {
    const { emit, signal } = stepOpts

    let res: Response
    try {
      res = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({ ...params, model: params.model ?? opts.defaultModel, stream: true }),
        signal,
      })
    } catch (err) {
      if (signal?.aborted) return // 断开/取消：静默收尾
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
    let reasoning = ''
    const chunks: ChatChunk[] = []
    let usage: ChatResponse['usage']
    try {
      for await (const chunk of parseProviderSse(res.body!)) {
        if (signal?.aborted) return // 断开：静默收尾
        const delta = chunk.choices[0]?.delta
        if (delta?.content) {
          content += delta.content
          emit('wf:token', { text: delta.content })
        }
        if (delta?.reasoning_content) reasoning += delta.reasoning_content
        if (delta?.tool_calls) chunks.push(chunk)
        if (chunk.usage) usage = chunk.usage
      }
    } catch (err) {
      if (signal?.aborted) return // 断开：静默收尾（不报错）
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

    if (usage && stepOpts.emitUsage !== false) emit('wf:usage', usage)
    stepOpts.onFinish?.({ content, reasoning_content: reasoning || undefined, toolCalls, usage })
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

  return {
    chat, stream, sse, streamStep, waitApproval, approve,
    // embedding：未配置 provider 时明确抛 AiError（诚实裁剪：不静默降级）
    embed: (text: string) => embedding.embed(text),
    embedMany: (texts: string[]) => embedding.embedMany(texts),
  }
}

/** 审批默认超时：5 分钟 */
export const DEFAULT_APPROVAL_TIMEOUT = 5 * 60_000

/** 工具参数可能是 JSON 字符串；解析失败给空对象（不抛错） */
export function safeParseArgs(raw: string): Record<string, unknown> {
  if (!raw) return {}
  try {
    return JSON.parse(raw) as Record<string, unknown>
  } catch {
    return {}
  }
}
