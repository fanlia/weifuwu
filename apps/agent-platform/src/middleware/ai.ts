/**
 * ctx.ai 中间件 — 注入 AiClient 实例
 */

import type { Context, Middleware } from 'weifuwu'
import type { AiClient, ChatParams, ChatResponse, ChatStreamCallbacks, AgentConfig, AgentRunResult } from '../ai/types.ts'
import { DeepSeekClient } from '../ai/deepseek.ts'
import { DashScopeClient } from '../ai/dashscope.ts'
import { createAgent } from '../ai/agent.ts'

// 类型扩展 — 声明 ctx.ai
declare module 'weifuwu' {
  interface Context {
    ai: AiClient
  }
}

/**
 * AI 中间件工厂
 *
 * 注入 ctx.ai，提供 LLM 对话、Agent Tool Loop、Embedding 能力
 *
 * ```ts
 * import { ai } from './middleware/ai.ts'
 * app.use(ai())
 *
 * app.post('/chat', async (req, ctx) => {
 *   const body = await req.json()
 *   const res = await ctx.ai.chat({ messages: body.messages })
 *   return Response.json(res)
 * })
 * ```
 */
export function ai(): Middleware<Context, Context & { ai: AiClient }> {
  const deepseek = new DeepSeekClient()
  const dashscope = new DashScopeClient()

  const aiClient: AiClient = {
    // ── LLM 对话 ──
    async chat(params: ChatParams): Promise<ChatResponse> {
      return deepseek.chat(params)
    },

    async chatStream(params: ChatParams & ChatStreamCallbacks): Promise<void> {
      return deepseek.chatStream(params)
    },

    // ── Agent Tool Loop ──
    agent(config: AgentConfig) {
      return createAgent(aiClient, config)
    },

    // ── Embedding ──
    async embed(text: string): Promise<number[]> {
      return dashscope.embed(text)
    },

    async embedMany(texts: string[]): Promise<number[][]> {
      return dashscope.embedMany(texts)
    },
  }

  const mw: Middleware = (req, ctx, next) => {
    ctx.ai = aiClient
    return next(req, ctx)
  }
  mw.__meta = { injects: ['ai'], depends: [] }

  return mw as Middleware<Context, Context & { ai: AiClient }>
}
