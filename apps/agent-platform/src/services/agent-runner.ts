/**
 * Agent 执行编排 — 调用 ctx.ai.agent 执行 AI Robot 的 Tool Loop
 *
 * 被 chat.ts 服务层调用，处理部门消息 → AI 自动回复
 */

import type { Context } from 'weifuwu'
import type { ChatMessage, AgentRunResult } from '../ai/types.ts'

export interface AgentRunnerConfig {
  agentId: string
  tenantId: string
  departmentId: string
  systemPrompt: string
  model?: string
  tools: unknown[]
  maxSteps?: number
  humanInTheLoop?: boolean
}

/**
 * 运行 Agent 并返回结果
 * 被消息发送后的钩子触发
 */
export async function runAgent(
  ctx: Context,
  config: AgentRunnerConfig,
  messages: ChatMessage[],
): Promise<AgentRunResult> {
  const { ai } = ctx

  const agentRunner = ai.agent({
    model: config.model,
    systemPrompt: config.systemPrompt,
    tools: config.tools as any[],
    maxSteps: config.maxSteps ?? 10,
    humanInTheLoop: config.humanInTheLoop ?? false,
  })

  return agentRunner.run(messages)
}

/**
 * 流式运行 Agent（用于 WebSocket 推送）
 */
export async function streamAgent(
  ctx: Context,
  config: AgentRunnerConfig,
  messages: ChatMessage[],
  callbacks: {
    onChunk: (chunk: string) => void
    onToolCall?: (toolCall: { name: string; args: string }) => void
    onFinish?: (result: { content: string }) => void
  },
): Promise<void> {
  const { ai } = ctx

  const agentRunner = ai.agent({
    model: config.model,
    systemPrompt: config.systemPrompt,
    tools: config.tools as any[],
    maxSteps: config.maxSteps ?? 10,
    humanInTheLoop: config.humanInTheLoop ?? false,
  })

  let fullContent = ''

  await agentRunner.stream(messages, {
    onChunk: (chunk) => {
      for (const choice of chunk.choices) {
        if (choice.delta.content) {
          fullContent += choice.delta.content
          callbacks.onChunk(choice.delta.content)
        }
      }
    },
    onToolCall: (toolCall) => {
      callbacks.onToolCall?.({ name: toolCall.function.name, args: toolCall.function.arguments })
    },
    onFinish: () => {
      callbacks.onFinish?.({ content: fullContent })
    },
  })
}
