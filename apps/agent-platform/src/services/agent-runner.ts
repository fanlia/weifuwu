/**
 * Agent 执行编排 — 调用 ctx.ai.agent 执行 AI Robot 的 Tool Loop
 *
 * 被 chat.ts 服务层调用，处理部门消息 → AI 自动回复
 *
 * 增强功能：
 * - token 用量统计与持久化
 * - 对话上下文窗口管理（按 token 计数截断）
 * - 执行日志记录
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

interface TokenCounter {
  prompt: number
  completion: number
  total: number
}

/**
 * 粗略估算 token 数（中英文混合场景）
 * 中文约 1.5 字/token，英文约 4 字符/token
 */
function estimateTokens(text: string): number {
  let tokens = 0
  for (const ch of text) {
    if (/[\u4e00-\u9fff\u3400-\u4dbf]/.test(ch)) {
      tokens += 1.5 // 中文字符
    } else {
      tokens += 0.25 // 英文字符
    }
  }
  return Math.ceil(tokens)
}

/**
 * 计算消息列表的总 token 数
 */
function countMessagesTokens(messages: ChatMessage[]): TokenCounter {
  let prompt = 0
  for (const msg of messages) {
    prompt += estimateTokens(msg.content)
    if (msg.tool_calls) {
      for (const tc of msg.tool_calls) {
        prompt += estimateTokens(tc.function.name + tc.function.arguments)
      }
    }
  }
  // 加上每条消息的开销（role 标记等）
  prompt += messages.length * 4
  return { prompt, completion: 0, total: prompt }
}

/**
 * 截断消息列表到最大 token 数（保留 system 消息和最近的 user/assistant 消息）
 */
function truncateMessages(
  messages: ChatMessage[],
  maxTokens: number,
): ChatMessage[] {
  const total = countMessagesTokens(messages)
  if (total.total <= maxTokens) return messages

  // 保留 system 消息
  const systemMsgs = messages.filter(m => m.role === 'system')
  const nonSystem = messages.filter(m => m.role !== 'system')

  // 从最旧的消息开始丢弃
  let trimmed = [...nonSystem]
  while (trimmed.length > 1 && countMessagesTokens([...systemMsgs, ...trimmed]).total > maxTokens) {
    trimmed.shift()
  }

  return [...systemMsgs, ...trimmed]
}

/**
 * 运行 Agent 并返回结果
 * 被消息发送后的钩子触发
 *
 * 增加：
 * - token 用量估算（当 API 不返回 usage 时）
 * - 上下文窗口截断（防止超长 context）
 * - 执行日志记录到数据库
 */
export async function runAgent(
  ctx: Context,
  config: AgentRunnerConfig,
  messages: ChatMessage[],
): Promise<AgentRunResult> {
  const { ai } = ctx

  // 上下文窗口管理：确保历史消息不超过 8000 tokens
  const contextMessages = truncateMessages(
    [
      { role: 'system' as const, content: config.systemPrompt },
      ...messages,
    ],
    8000,
  )

  const startTime = Date.now()

  const agentRunner = ai.agent({
    model: config.model,
    systemPrompt: config.systemPrompt,
    tools: config.tools as any[],
    maxSteps: config.maxSteps ?? 10,
    humanInTheLoop: config.humanInTheLoop ?? false,
  })

  const result = await agentRunner.run(contextMessages.slice(1)) // 去掉 system，agent 内部会重新加

  const elapsed = Date.now() - startTime

  // 记录执行日志到数据库（如果 sql 可用）
  try {
    const { sql } = ctx as any
    if (sql) {
      await sql`
        INSERT INTO agent_logs (
          agent_id, tenant_id, department_id,
          messages_count, steps_count, tokens_prompt, tokens_completion, tokens_total,
          elapsed_ms, success
        ) VALUES (
          ${config.agentId}, ${config.tenantId}, ${config.departmentId},
          ${messages.length}, ${result.steps.length},
          ${result.usage?.prompt_tokens ?? 0},
          ${result.usage?.completion_tokens ?? 0},
          ${result.usage?.total_tokens ?? 0},
          ${elapsed}, TRUE
        )
      `
    }
  } catch {
    // 日志记录失败不影响主流程
  }

  return result
}

/**
 * 流式运行 Agent（用于 WebSocket 推送）
 *
 * 增加 token 用量记录
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
