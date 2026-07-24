/**
 * 消息路由 + 推送服务
 *
 * 监听新消息 → 判断是否需要 AI 自动回复 → 调用 agent-runner
 * 通过 WebSocket 推送回复到对应部门
 */

import type { Context } from 'weifuwu'
import { runAgent } from './agent-runner.ts'
import { wsHub } from './ws-hub.ts'

/**
 * 处理新消息 — 被消息路由创建后调用
 *
 * 1. 查找部门中的 AI Agent
 * 2. 构建对话上下文
 * 3. 调用 Agent 生成回复
 * 4. 保存回复消息
 * 5. 通过 WS 推送
 */
export async function handleNewMessage(
  ctx: Context,
  departmentId: string,
  senderId: string,
  messageContent: string,
): Promise<void> {
  const { sql } = ctx

  // 查找部门中所有 AI Agent
  const aiAgents = await sql`
    SELECT a.id, a.name, a.system_prompt, a.model, a.tools, a.human_in_the_loop, a.max_tokens
    FROM department_members dm
    JOIN agents a ON a.id = dm.agent_id
    WHERE dm.department_id = ${departmentId}
      AND a.type = 'ai'
      AND a.is_active = TRUE
  `

  if (aiAgents.length === 0) return // 没有 AI Agent，无需自动回复

  // 如果 API key 为占位符或未配置，跳过 AI 回复
  const apiKey = process.env.DEEPSEEK_API_KEY
  if (!apiKey || apiKey === '' || apiKey === 'sk-your-deepseek-api-key') {
    console.warn('[chat] DEEPSEEK_API_KEY 未配置，跳过 AI 自动回复')
    return
  }

  // 获取最近消息历史（逆序还原为正序）
  const recentMessages = await sql`
    SELECT m.content, m.created_at, a.name as sender_name, a.type as sender_type
    FROM messages m
    JOIN agents a ON a.id = m.sender_id
    WHERE m.department_id = ${departmentId} AND m.ai_approved != FALSE
    ORDER BY m.created_at DESC
    LIMIT 20
  `

  // 构建 ChatMessage[] — 包含历史上下文
  const chatMessages: import('../ai/types.ts').ChatMessage[] = []
  for (const msg of recentMessages.reverse()) {
    if (msg.sender_type === 'user' || msg.sender_type === 'ai') {
      chatMessages.push({
        role: msg.sender_type === 'ai' ? 'assistant' : 'user',
        content: msg.content,
      })
    }
  }
  // 追加当前消息
  chatMessages.push({ role: 'user', content: messageContent })

  // 为每个 AI Agent 生成回复
  for (const agent of aiAgents) {
    try {
      const systemPrompt = agent.system_prompt ?? '你是一个有帮助的 AI 助手。'
      const tools = typeof agent.tools === 'string' ? JSON.parse(agent.tools) : (agent.tools ?? [])

      const result = await runAgent(ctx, {
        agentId: agent.id,
        tenantId: ctx.tenantId,
        departmentId,
        systemPrompt,
        model: agent.model,
        tools,
        maxSteps: agent.max_tokens ? Math.min(agent.max_tokens, 20) : 10,
        humanInTheLoop: agent.human_in_the_loop ?? false,
      }, chatMessages)

      // 保存回复消息
      const content = result.content
      if (!content) continue

      if (agent.human_in_the_loop) {
        // Human-in-the-Loop: 保存为草稿，待审批
        const [draftMsg] = await sql`
          INSERT INTO messages (department_id, sender_id, content, msg_type, ai_draft, ai_approved, ai_step)
          VALUES (${departmentId}, ${agent.id}, '[AI 生成中...]', 'text', ${content}, NULL, ${JSON.stringify({ steps: result.steps })})
          RETURNING id, content, created_at
        `

        // WS 推送审批通知
        wsHub.broadcast(departmentId, {
          type: 'ai_draft',
          message: { id: draftMsg.id, agentId: agent.id, agentName: agent.name, draft: content, departmentId, createdAt: draftMsg.created_at },
        })
      } else {
        // 自动回复
        const [replyMsg] = await sql`
          INSERT INTO messages (department_id, sender_id, content, msg_type, ai_approved)
          VALUES (${departmentId}, ${agent.id}, ${content}, 'text', TRUE)
          RETURNING id, content, created_at
        `

        // WS 推送
        wsHub.broadcast(departmentId, {
          type: 'ai_reply',
          message: { id: replyMsg.id, agentId: agent.id, agentName: agent.name, content, departmentId, createdAt: replyMsg.created_at },
        })
      }
    } catch (err) {
      console.error(`[chat] Agent ${agent.id} error:`, err)
    }
  }
}
