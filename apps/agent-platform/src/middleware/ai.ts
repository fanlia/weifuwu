/**
 * ctx.ai 中间件 — 注入 AiClient 实例
 */

import type { Context, Middleware } from 'weifuwu'
import { ai as frameworkAi } from 'weifuwu'
import type { AiClient, ChatParams, ChatResponse, ChatStreamCallbacks, AgentConfig, AgentRunResult } from '../ai/types.ts'
import { DeepSeekClient } from '../ai/deepseek.ts'
import { createAgent } from '../ai/agent.ts'

// 类型注入：不 declare module 覆盖框架 Context（框架已声明 ai?: AiClientModule，类型不同会冲突）。
// 用显式交叉类型：使用方 `ctx: AiContext` 即可拿到本项目的 AiClient（含 embed/chatStream）。
export interface AiInjected {
  ai: AiClient
}
/** 项目内 AI 上下文（server/agent-runner/builtin 用） */
export type AiContext = Context & AiInjected

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
export function ai(): Middleware<Context, AiContext> {
  const deepseek = new DeepSeekClient()

  // Embedding 走框架 ctx.ai（P1：知识库能力集成到 weifuwu，参数对齐 DashScope：
  // DASHSCOPE_API_KEY / text-embedding-v4）。chat/agent 保留自研（回调式协议 + 部门编排）。
  const frameworkModule = frameworkAi({})
  const embedding = { embed: frameworkModule.embed, embedMany: frameworkModule.embedMany }

  const aiClient: AiClient = {
    // ── LLM 对话 ──
    async chat(params: ChatParams): Promise<ChatResponse> {
      return deepseek.chat(params)
    },

    async chatStream(params: ChatParams & ChatStreamCallbacks): Promise<void> {
      return deepseek.chatStream(params)
    },

    // ── Agent Tool Loop ──
    agent(config: AgentConfig, skillRegistry?: any) {
      return createAgent(aiClient, config, skillRegistry)
    },

    // ── Embedding（框架 ctx.ai 提供） ──
    async embed(text: string): Promise<number[]> {
      return embedding.embed(text)
    },

    async embedMany(texts: string[]): Promise<number[][]> {
      return embedding.embedMany(texts)
    },
  }

  const mw: Middleware = (req, ctx, next) => {
    ;(ctx as any).ai = aiClient
    return next(req, ctx)
  }
  mw.__meta = { injects: ['ai'], depends: [] }

  return mw as Middleware<Context, AiContext>
}
