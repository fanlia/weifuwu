/**
 * weifuwu AI — 中间件工厂（queue 式混合：模块即中间件，也独立可用）
 *
 * ```ts
 * import { ai } from 'weifuwu'
 *
 * const a = ai()                    // DEEPSEEK_API_KEY / BASE_URL / MODEL 自动读 env
 * app.use(a)                        // → ctx.ai.chat / ctx.ai.stream / ctx.ai.sse
 *
 * app.post('/api/chat', async (req, ctx) => {
 *   const { messages } = await req.json()
 *   return ctx.ai.stream({ messages }, {
 *     signal: req.signal,
 *     traceId: req.headers.get('x-trace-id') ?? undefined,   // 追踪关联（协议 §7）
 *   })
 * })
 *
 * // worker / 非请求场景：同一个实例直接调用
 * q.worker('llm.batch', async (job) => {
 *   await a.chat({ messages: job.data.messages })
 * })
 * ```
 *
 * 配置优先级：显式参数 > env > 默认值。
 *   apiKey:      DEEPSEEK_API_KEY
 *   baseUrl:     DEEPSEEK_BASE_URL      → 'https://api.deepseek.com/v1'
 *   defaultModel: DEEPSEEK_MODEL        → 'deepseek-v4-flash'
 */

import type { Context, Middleware } from '../types.ts'
import { createAiClient, type AiClient, type AiClientOptions, type AiEmbeddingOptions } from './client.ts'
import { createAgent, type AgentConfig, type AgentRunner } from './agent.ts'
import type { Ai } from './contracts.ts'

export type { Ai } from './contracts.ts'

export type { AiEmbeddingOptions } from './client.ts'
export type { AgentRunResult, AgentStep, AgentTool, AgentConfig, AgentRunner, ToolContext } from './agent.ts'

export interface AiOptions extends Partial<AiClientOptions> {}

export interface AiInjected {
  ai: Ai
}

/** 模块 = 中间件 + 客户端（queue 式混合：app.use(a) + worker 直接 a.chat()）。
 *  实现 Ai 契约（src/ai/contracts.ts 单一来源）；streamStep 为 agent 内部细节（不在契约） */
export interface AiClientModule extends Middleware<Context, Context & AiInjected>, Ai {
  /** 内部：单轮 LLM 流式 → emit 事件 + 聚合结果（agent 引擎用——不在契约 Ai） */
  streamStep: AiClient['streamStep']
}

declare module '../types.ts' {
  interface Context {
    /** 注入模块本身（含 agent / approve），worker 场景直接 a.chat() */
    ai?: Ai
  }
}

export function ai(options?: AiOptions): AiClientModule {
  const apiKey = options?.apiKey ?? process.env.DEEPSEEK_API_KEY ?? ''
  const baseUrl = options?.baseUrl ?? process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com/v1'
  const defaultModel = options?.defaultModel ?? process.env.DEEPSEEK_MODEL ?? 'deepseek-v4-flash'

  if (!apiKey) {
    throw new Error('ai: DEEPSEEK_API_KEY 未设置。请设置环境变量或传入 apiKey')
  }

  const client = createAiClient({ apiKey, baseUrl, defaultModel, embedding: options?.embedding })

  const mw: Middleware = (req, ctx, next) => {
    ctx.ai = module
    return next(req, ctx)
  }
  mw.__meta = { injects: ['ai'], depends: [] }

  const module = mw as AiClientModule
  module.chat = client.chat
  module.stream = client.stream
  module.sse = client.sse
  module.streamStep = client.streamStep
  module.waitApproval = client.waitApproval
  module.approve = client.approve
  module.agent = (config: AgentConfig) => createAgent(client, config)
  module.embed = client.embed
  module.embedMany = client.embedMany
  module.close = async () => {}

  return module
}

// ── 协议类型 re-export（类型流：weifuwu 主包即可见）───────

export type {
  WfStreamEvent,
  WfMessageStart,
  WfToken,
  WfUsage,
  WfDone,
  WfError,
  WfErrorCode,
  WfToolCall,
  WfToolResult,
  WfToolProgress,
  WfStep,
  WfApprovalRequest,
  WfApprovalResponse,
  WfApprovalDecision,
  ChatMessage,
  ChatParams,
  MessageRole,
  ToolCall,
  ToolDefinition,
} from './types.ts'

export type { WfEmitter } from './sse.ts'
export { AiError } from './client.ts'
export type { AiClient, ChatResponse } from './client.ts'
