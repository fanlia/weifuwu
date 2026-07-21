/**
 * Webhook 消息收发服务
 *
 * Webhook Bot 通过 HTTP POST 接收外部消息，调用 AI 处理后返回
 */

import type { Context } from 'weifuwu'
import type { ChatMessage } from '../ai/types.ts'

export interface WebhookRequest {
  content: string
  conversation_id?: string
  [key: string]: unknown
}

export interface WebhookResponse {
  reply: string
  conversation_id?: string
}

/**
 * 处理 Webhook Bot 的入站消息
 *
 * 1. 查找 agent 配置
 * 2. 构建对话消息
 * 3. 调用 AI 生成回复
 * 4. 返回响应
 *
 * 注意：Webhook 端点公开，server.ts 中需在调用前验证 tenant（通过 URL 路径或 token）
 */
export async function handleWebhookMessage(
  ctx: Context,
  agentId: string,
  body: WebhookRequest,
  tenantId?: string,
): Promise<WebhookResponse> {
  const { sql, ai } = ctx

  // 查找 agent — 如果有 tenantId 则验证租户隔离
  const [agent] = tenantId
    ? await sql`
        SELECT id, system_prompt, model, tools, temperature, max_tokens
        FROM agents
        WHERE id = ${agentId} AND type = 'webhook' AND is_active = TRUE AND tenant_id = ${tenantId}
      `
    : await sql`
        SELECT id, system_prompt, model, tools, temperature, max_tokens
        FROM agents
        WHERE id = ${agentId} AND type = 'webhook' AND is_active = TRUE
      `

  if (!agent) {
    throw new Error('Webhook Bot not found or inactive')
  }

  const systemPrompt = agent.system_prompt ?? '你是一个 Webhook Bot。'
  const tools = typeof agent.tools === 'string' ? JSON.parse(agent.tools) : (agent.tools ?? [])

  // 统一走 agent runner（兼容纯对话和 tool calling）
  const agentRunner = ai.agent({
    model: agent.model,
    systemPrompt,
    tools,
    maxSteps: tools.length > 0 ? 5 : 1,
  })

  const result = await agentRunner.run([{ role: 'user', content: body.content }])

  return {
    reply: result.content,
    conversation_id: body.conversation_id,
  }
}
