/**
 * 消息路由 + 推送服务
 *
 * 监听新消息 → 判断是否需要 AI 自动回复 → 调用 agent-runner
 * 通过 WebSocket 推送回复到对应部门
 */

import type { Context } from 'weifuwu'
import { runAgent, streamAgent } from './agent-runner.ts'
import { SkillRegistry, loadSkill } from './skills.ts'
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

      // 加载 Agent 已启用的技能
      const preloadedSkills: import('./skills.ts').SkillContext[] = []
      try {
        const agentSkills = await sql`
          SELECT ask.skill_dir, ask.skill_name
          FROM agent_skills ask
          WHERE ask.agent_id = ${agent.id} AND ask.enabled = TRUE
        `
        for (const as of agentSkills) {
          try {
            const skill = await loadSkill(as.skill_dir, () => ctx)
            preloadedSkills.push(skill)
          } catch (err) {
            console.warn(`[chat] 加载技能 ${as.skill_name} 失败:`, err)
          }
        }
      } catch {
        // agent_skills 表可能不存在，忽略
      }

      const result = await runAgent(ctx, {
        agentId: agent.id,
        tenantId: ctx.tenantId,
        departmentId,
        systemPrompt,
        model: agent.model,
        tools,
        maxSteps: agent.max_tokens ? Math.min(agent.max_tokens, 20) : 10,
        humanInTheLoop: agent.human_in_the_loop ?? false,
        preloadedSkills,
        workspacePath: agent.workspace_path,
        allowFileTools: agent.allow_file_tools,
        allowCommandExec: agent.allow_command_exec,
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

/**
 * 流式处理新消息 — 异步触发，不阻塞 HTTP 响应
 *
 * 与 handleNewMessage 的区别：
 *   - 调用 streamAgent() 替代 runAgent()
 *   - 先创建空消息占位，拿到 messageId
 *   - 逐 chunk 通过 WS 推送到前端
 *   - HITL 模式保持非流式（等审批）
 *
 * @param messageId 已创建的空消息 ID
 */
export async function handleNewMessageStream(
  ctx: Context,
  departmentId: string,
  senderId: string,
  messageContent: string,
  messageId: string,
): Promise<void> {
  const { sql } = ctx

  // 检查 API key 是否可用
  const apiKey = process.env.DEEPSEEK_API_KEY
  if (!apiKey || apiKey === '' || apiKey === 'sk-your-deepseek-api-key' || apiKey.startsWith('sk-your-')) {
    console.warn('[chat] DEEPSEEK_API_KEY 未配置，跳过 AI 自动回复')
    return
  }

  // 查找部门中所有 AI Agent
  const aiAgents = await sql`
    SELECT a.id, a.name, a.system_prompt, a.model, a.tools, a.human_in_the_loop, a.max_tokens,
      a.workspace_path, a.allow_file_tools, a.allow_command_exec
    FROM department_members dm
    JOIN agents a ON a.id = dm.agent_id
    WHERE dm.department_id = ${departmentId}
      AND a.type = 'ai'
      AND a.is_active = TRUE
  `

  if (aiAgents.length === 0) return

  // 获取最近消息历史
  const recentMessages = await sql`
    SELECT m.content, m.created_at, a.name as sender_name, a.type as sender_type
    FROM messages m
    JOIN agents a ON a.id = m.sender_id
    WHERE m.department_id = ${departmentId} AND m.ai_approved != FALSE
    ORDER BY m.created_at DESC
    LIMIT 20
  `

  const chatMessages: import('../ai/types.ts').ChatMessage[] = []
  for (const msg of recentMessages.reverse()) {
    if (msg.sender_type === 'user' || msg.sender_type === 'ai') {
      chatMessages.push({
        role: msg.sender_type === 'ai' ? 'assistant' : 'user',
        content: msg.content,
      })
    }
  }
  chatMessages.push({ role: 'user', content: messageContent })

  for (const agent of aiAgents) {
    // HITL 模式：保持非流式，走现有路径
    if (agent.human_in_the_loop) {
      const systemPrompt = agent.system_prompt ?? '你是一个有帮助的 AI 助手。'
      const tools = typeof agent.tools === 'string' ? JSON.parse(agent.tools) : (agent.tools ?? [])
      const preloadedSkills = await loadAgentSkills(sql, agent.id, ctx)

      const result = await runAgent(ctx, {
        agentId: agent.id,
        tenantId: ctx.tenantId,
        departmentId,
        systemPrompt,
        model: agent.model,
        tools,
        maxSteps: agent.max_tokens ? Math.min(agent.max_tokens, 20) : 10,
        humanInTheLoop: true,
        preloadedSkills,
        allowFileTools: agent.allow_file_tools,
        allowCommandExec: agent.allow_command_exec,
      }, chatMessages)

      const content = result.content
      if (!content) continue

      const [draftMsg] = await sql`
        INSERT INTO messages (department_id, sender_id, content, msg_type, ai_draft, ai_approved, ai_step)
        VALUES (${departmentId}, ${agent.id}, '[AI 生成中...]', 'text', ${content}, NULL, ${JSON.stringify({ steps: result.steps })})
        RETURNING id
      `
      wsHub.broadcast(departmentId, {
        type: 'ai_draft',
        message: { id: draftMsg.id, agentId: agent.id, agentName: agent.name, draft: content, departmentId, createdAt: new Date().toISOString() },
      })
      continue
    }

    // 非 HITL：流式输出
    const systemPrompt = agent.system_prompt ?? '你是一个有帮助的 AI 助手。'
    const tools = typeof agent.tools === 'string' ? JSON.parse(agent.tools) : (agent.tools ?? [])
    const preloadedSkills = await loadAgentSkills(sql, agent.id, ctx)

    // 为该 Agent 创建一条空消息作为占位
    const [replyMsg] = await sql`
      INSERT INTO messages (department_id, sender_id, content, msg_type, ai_approved)
      VALUES (${departmentId}, ${agent.id}, '', 'text', TRUE)
      RETURNING id, created_at
    `
    const msgId = replyMsg.id

    // ── AI 状态机事件 ─────────────────────────────────
    // 完整反映 AI Agent 内部状态：
    //   ai:status { status: "thinking" }       → LLM 调用开始
    //   ai:status { status: "generating" }     → 流式输出文本
    //   ai:token  { text }                      → 文本片段
    //   ai:tool   { phase: "call", name, args } → 工具调用
    //   ai:tool   { phase: "result", name }     → 工具返回
    //   ai:status { status: "complete" }        → 生成完成
    //   ai:status { status: "error", error }    → 生成失败

    // 1) thinking — LLM 开始思考
    wsHub.broadcast(departmentId, {
      type: 'ai:status',
      messageId: msgId,
      agentId: agent.id,
      agentName: agent.name,
      status: 'thinking',
    })

    let accumulatedContent = ''
    let streamFailed = false
    let hasEmittedGenerating = false
    let finalUsage: { prompt_tokens: number; completion_tokens: number; total_tokens: number } | undefined

    try {
      finalUsage = await streamAgent(ctx, {
        agentId: agent.id,
        tenantId: ctx.tenantId,
        departmentId,
        systemPrompt,
        model: agent.model,
        tools,
        maxSteps: agent.max_tokens ? Math.min(agent.max_tokens, 20) : 10,
        humanInTheLoop: false,
        preloadedSkills,
        allowFileTools: agent.allow_file_tools,
        allowCommandExec: agent.allow_command_exec,
      }, chatMessages, {
        onChunk: async (text: string) => {
          accumulatedContent += text
          await sql`UPDATE messages SET content = ${accumulatedContent} WHERE id = ${msgId}`

          // 首个文本 chunk 时切换为 generating
          if (!hasEmittedGenerating && text) {
            hasEmittedGenerating = true
            wsHub.broadcast(departmentId, {
              type: 'ai:status',
              messageId: msgId,
              status: 'generating',
            })
          }

          wsHub.broadcast(departmentId, {
            type: 'ai:token',
            messageId: msgId,
            text,
          })
        },
        onToolCall: (toolCall: { name: string; args: string }) => {
          wsHub.broadcast(departmentId, {
            type: 'ai:tool',
            messageId: msgId,
            phase: 'call',
            name: toolCall.name,
            args: toolCall.args,
          })
        },
        onToolResult: (result: { name: string; result: string }) => {
          // 工具执行完后又回到 thinking（LLM 继续）
          hasEmittedGenerating = false
          wsHub.broadcast(departmentId, {
            type: 'ai:tool',
            messageId: msgId,
            phase: 'result',
            name: result.name,
            result: result.result,
          })
          wsHub.broadcast(departmentId, {
            type: 'ai:status',
            messageId: msgId,
            status: 'thinking',
          })
        },
        onFinish: () => {
          // streamAgent 内部每个流式步骤结束时触发
          // 不在此处发 complete，等全部完成后统一发
        },
      })
    } catch (err) {
      streamFailed = true
      console.error(`[chat] streamAgent ${agent.id} error:`, err)
    }

    // 全部完成 → complete 或 error
    if (streamFailed) {
      if (!accumulatedContent) {
        await sql`DELETE FROM messages WHERE id = ${msgId} AND content = ''`
      }
      wsHub.broadcast(departmentId, {
        type: 'ai:status',
        messageId: msgId,
        status: 'error',
        error: 'AI 回复失败',
      })
    } else {
      // 记录 token 用量
      if (finalUsage) {
        try {
          await sql`
            INSERT INTO agent_logs (agent_id, tenant_id, department_id, messages_count, steps_count,
              tokens_prompt, tokens_completion, tokens_total, elapsed_ms, success)
            VALUES (${agent.id}, ${ctx.tenantId}, ${departmentId},
              ${chatMessages.length}, 1,
              ${finalUsage.prompt_tokens}, ${finalUsage.completion_tokens}, ${finalUsage.total_tokens},
              0, TRUE)
          `
        } catch { /* 日志失败不影响主流程 */ }
      }

      wsHub.broadcast(departmentId, {
        type: 'ai:status',
        messageId: msgId,
        status: 'complete',
        content: accumulatedContent,
        usage: finalUsage,
      })
    }
  }
}

/**
 * 加载 Agent 的技能
 */
async function loadAgentSkills(sql: any, agentId: string, ctx: Context): Promise<import('./skills.ts').SkillContext[]> {
  const preloadedSkills: import('./skills.ts').SkillContext[] = []
  try {
    const agentSkills = await sql`
      SELECT skill_dir, skill_name FROM agent_skills
      WHERE agent_id = ${agentId} AND enabled = TRUE
    `
    for (const as of agentSkills) {
      try {
        const skill = await loadSkill(as.skill_dir, () => ctx)
        preloadedSkills.push(skill)
      } catch (err) {
        console.warn(`[chat] 加载技能 ${as.skill_name} 失败:`, err)
      }
    }
  } catch {
    // agent_skills 表可能不存在
  }
  return preloadedSkills
}
