/**
 * weifuwu AI — MemoryAi：内存版 AI 客户端（实现 AiClient 契约）
 *
 * 参考 MemorySql（src/db/memory-sql.ts）模式：
 *   - class 内部引擎（非 callable）——createMemoryAi() 工厂包装为契约形状
 *   - 实现契约面（AiClient）——与 makeSql(PgPool) 同构——消费端无感替换
 *   - 确定性：onChat 决策注入 / 默认 echo / 哈希嵌入——零外部依赖零网络
 *   - 诚实裁剪：非真实智能——未注入决策时默认回显末条用户消息（不编造
 *     tool_calls——对齐 MemorySql「不支持的抛 unsupported 绝不静默降级」纪律）
 *
 * 用途：测试（确定性决策注入——LLM 面可预测）/ 离线 dev / 单实例无 key。
 * 真实智能质量面由 OpenAI 兼容 provider 承担（文档红线）。
 */
import { randomUUID } from 'node:crypto'
import { sseResponse, type WfEmitter } from './sse.ts'
import { createApprovalHub, DEFAULT_APPROVAL_TIMEOUT, type ApprovalEmitter } from './approvals.ts'
import type { AiClient, StreamFinishResult } from './client.ts'
import type { ChatMessage, ChatParams, ToolCall, WfApprovalResponse } from './types.ts'
import type { ChatResponse } from './client.ts'
import type { ImageGenRequest, ImageGenResult, VideoGenRequest, VideoGenStatus } from './contracts.ts'

/** MemoryAi 决策注入选项（= MemorySql 的「解析器」——注入方决定回什么） */
export interface MemoryAiOptions {
  /**
   * 决策注入：chat 请求 → 响应内容。不注入 = 默认 echo（末条 user 消息）。
   * 返回 shape：{ content, toolCalls?, reasoning_content?, usage? }
   *   （工具决策：e2e 测试注入 tool_calls 序列——无需真实 LLM）
   */
  onChat?: (params: ChatParams) =>
    | Promise<{ content: string; toolCalls?: ToolCall[]; reasoning_content?: string; usage?: StreamFinishResult['usage'] }>
    | { content: string; toolCalls?: ToolCall[]; reasoning_content?: string; usage?: StreamFinishResult['usage'] }
  /** 嵌入注入（返回值需 text 长度 = 输入顺序）；默认 djb2 哈希向量（确定性） */
  onEmbed?: (texts: string[]) => Promise<number[][]> | number[][]
  /** 图片生成注入（测试断言生成面）；默认 1×1 透明 PNG data URL（确定性占位） */
  onImage?: (req: ImageGenRequest) => Promise<ImageGenResult> | ImageGenResult
  /** 视频任务注入（onVideoSubmit: 提交→taskId；onVideoStatus: 查询→状态）——默认立即完成 */
  onVideoSubmit?: (req: VideoGenRequest) => Promise<{ taskId: string }> | { taskId: string }
  onVideoStatus?: (taskId: string) => Promise<VideoGenStatus> | VideoGenStatus
  /** 默认模型名（响应回显——对齐真实 provider 行为） */
  defaultModel?: string
  /** 审批超时 ms（默认 5 分钟——对齐 OpenAI transport） */
  approvalTimeoutMs?: number
}

/** djb2 哈希 → 32 维确定性向量（归一化——同文本同向量；不同文本差异性足够） */
function hashVector(text: string, dim = 32): number[] {
  let h = 5381
  const vec = new Array<number>(dim)
  for (let i = 0; i < dim; i++) {
    h = ((h << 5) + h) ^ (text.charCodeAt(i % text.length) + i * 31)
    h |= 0
    vec[i] = (h % 1000) / 1000
  }
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1
  return vec.map((v) => v / norm)
}

/** 内部引擎（对齐 MemorySql class 定位——不可直接构造——工厂包装导出） */
export class MemoryAi {
  private readonly opts: MemoryAiOptions
  private approvals: ReturnType<typeof createApprovalHub>
  private readonly model: string

  constructor(opts: MemoryAiOptions = {}) {
    // parameter property 在 Node strip-only 不支持——显式字段赋值
    this.opts = opts
    this.approvals = createApprovalHub(opts.approvalTimeoutMs ?? DEFAULT_APPROVAL_TIMEOUT)
    this.model = opts.defaultModel ?? 'memory-ai'
  }

  /** 默认决策：echo 末条 user 消息（确定性替身——不编造 tool_calls） */
  private async decide(params: ChatParams): Promise<{ content: string; toolCalls: ToolCall[]; reasoning_content?: string; usage?: StreamFinishResult['usage'] }> {
    if (this.opts.onChat) {
      const r = await this.opts.onChat(params)
      return { content: r.content, reasoning_content: r.reasoning_content, toolCalls: r.toolCalls ?? [], usage: r.usage }
    }
    const lastUser = [...params.messages].reverse().find((m) => m.role === 'user')
    const content = `MemoryAI: ${typeof lastUser?.content === 'string' ? lastUser.content : ''}`
    return { content, toolCalls: [] }
  }

  async chat(params: ChatParams, _options?: { signal?: AbortSignal }): Promise<ChatResponse> {
    const r = await this.decide(params)
    const message: ChatMessage = {
      role: 'assistant',
      content: r.content,
      ...(r.reasoning_content ? { reasoning: r.reasoning_content } : {}),
      ...(r.toolCalls.length > 0 ? { tool_calls: r.toolCalls } : {}),
    }
    return {
      id: randomUUID(),
      model: params.model ?? this.model,
      choices: [{ index: 0, message, finish_reason: r.toolCalls.length > 0 ? 'tool_calls' : 'stop' }],
      usage: r.usage,
    }
  }

  /** 单轮流式 → emit wf: 事件 + onFinish 聚合（agent 循环复用——同 OpenAI transport） */
  async streamStep(
    params: ChatParams,
    stepOpts: {
      emit: WfEmitter
      signal?: AbortSignal
      onFinish?: (r: StreamFinishResult) => void
      emitUsage?: boolean
      retries?: number
    },
  ): Promise<void> {
    if (stepOpts.signal?.aborted) return
    const r = await this.decide(params)
    if (stepOpts.signal?.aborted) return
    if (r.content) stepOpts.emit('wf:token', { text: r.content })
    for (const tc of r.toolCalls) {
      stepOpts.emit('wf:tool_call', {
        id: tc.id,
        name: tc.function?.name ?? '',
        args: safeParseArgs(tc.function?.arguments ?? ''),
      })
    }
    if (r.usage && stepOpts.emitUsage !== false) stepOpts.emit('wf:usage', r.usage)
    stepOpts.onFinish?.({
      content: r.content,
      reasoning_content: r.reasoning_content,
      toolCalls: r.toolCalls,
      usage: r.usage,
    })
  }

  stream(params: ChatParams, options?: { signal?: AbortSignal; traceId?: string }): Response {
    return sseResponse(
      async (emit) => {
        emit('wf:message_start', { id: options?.traceId ?? randomUUID() })
        await this.streamStep(params, {
          emit,
          signal: options?.signal,
          onFinish: (r) => emit('wf:done', {
            content: r.content,
            usage: r.usage,
            ...(r.reasoning_content ? { reasoning: r.reasoning_content } : {}),
          }),
        })
      },
      // 内存实现无上游请求——onAbort 不需要（事件序列可中断——取消走 signal）
      { onAbort: () => {} },
    )
  }

  sse(run: (emit: WfEmitter) => Promise<void> | void, options?: { signal?: AbortSignal }): Response {
    return sseResponse(run, { onAbort: () => {} })
  }

  approve(response: WfApprovalResponse): boolean {
    return this.approvals.approve(response)
  }

  waitApproval(
    req: { id: string; toolCallId: string; name: string; args: Record<string, unknown> },
    emit: ApprovalEmitter,
    timeoutMs?: number,
    signal?: AbortSignal,
  ): Promise<WfApprovalResponse> {
    return this.approvals.waitApproval(req, emit, timeoutMs, signal)
  }

  /** 确定性嵌入（djb2 哈希向量——无 key 也可跑知识库语义链的测试） */
  async embed(text: string): Promise<number[]> {
    return (await this.embedMany([text]))[0]
  }

  async embedMany(texts: string[]): Promise<number[][]> {
    if (this.opts.onEmbed) return this.opts.onEmbed(texts)
    return texts.map((t) => hashVector(t))
  }

  /** 占位图：1×1 透明 PNG data URL（确定性——测试可断言生成面被调） */
  private static readonly TINY_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='

  async generateImage(req: ImageGenRequest, _options?: { signal?: AbortSignal }): Promise<ImageGenResult> {
    if (this.opts.onImage) return this.opts.onImage(req)
    return { dataUrl: MemoryAi.TINY_PNG, mime: 'image/png' }
  }

  async createVideoTask(req: VideoGenRequest, _options?: { signal?: AbortSignal }): Promise<{ taskId: string }> {
    if (this.opts.onVideoSubmit) return this.opts.onVideoSubmit(req)
    // 默认：立即完成语义——taskId 确定性（测试可回放 videoStatus）
    return { taskId: `memory-task-${req.prompt.slice(0, 8) || 'empty'}` }
  }

  async videoStatus(taskId: string, _options?: { signal?: AbortSignal }): Promise<VideoGenStatus> {
    if (this.opts.onVideoStatus) return this.opts.onVideoStatus(taskId)
    // 默认：任务已生成——占位 URL（无真实媒体——编排层不落盘/或按注入断言）
    return { status: 'done', url: `memory://video/${taskId}` }
  }

  async close(): Promise<void> {
    // 无资源（内存实现）——no-op（对齐 MemorySql.close 定位）
  }
}

/** 工厂：类不可直接构造——包装为契约形状（与 makeSql(PgPool) / createMemorySql 同构） */
export function createMemoryAi(options?: MemoryAiOptions): AiClient {
  const engine = new MemoryAi(options)
  return {
    chat: (params, o) => engine.chat(params, o),
    stream: (params, o) => engine.stream(params, o),
    sse: (run, o) => engine.sse(run, o),
    streamStep: (params, o) => engine.streamStep(params, o),
    approve: (r) => engine.approve(r),
    waitApproval: (req, emit, t, s) => engine.waitApproval(req, emit, t, s),
    embed: (t) => engine.embed(t),
    embedMany: (texts) => engine.embedMany(texts),
    generateImage: (req, o) => engine.generateImage(req, o),
    createVideoTask: (req, o) => engine.createVideoTask(req, o),
    videoStatus: (taskId, o) => engine.videoStatus(taskId, o),
    close: () => engine.close(),
  }
}

/** 工具参数可能是 JSON 字符串；解析失败给空对象（不抛错——同 OpenAI transport） */
function safeParseArgs(raw: string): Record<string, unknown> {
  if (!raw) return {}
  try {
    return JSON.parse(raw) as Record<string, unknown>
  } catch {
    return {}
  }
}
