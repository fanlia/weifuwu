/**
 * 消息路由 + 推送服务
 *
 * 监听新消息 → 判断是否需要 AI 自动回复 → 调用 agent-runner
 * 通过 WebSocket 或 SSE 推送回复到对应部门
 *
 * 传输层抽象：StreamEmitter 接口将事件发射与具体传输解耦
 *   WsEmitter  → wsHub.broadcast()
 *   SseEmitter → response.write()
 *   TestEmitter → events[] 数组（用于测试）
 */

import type { Context } from 'weifuwu'
import type { AppCtx } from '../middleware/ctx.ts'
import { runAgent, streamAgent } from './agent-runner.ts'
import { SkillRegistry, loadSkill } from './skills.ts'

// ── 流式事件类型 ───────────────────────────────────────

/**
 * 流式事件：框架 wf:* 协议（AI 回合事件）+ 应用层元数据（messageId/agentId）。
 * 业务事件（new_message/message_edited/message_deleted/ai_draft）仍为应用自有类型。
 */
export interface StreamEvent {
  type: 'wf:step' | 'wf:token' | 'wf:tool_result' | 'wf:done' | 'wf:error' | 'wf:usage'
  messageId: string
  [key: string]: unknown
}

/** 传输层抽象：emit(event) 负责将事件发送到具体通道 */
export interface StreamEmitter {
  emit(event: StreamEvent): void | Promise<void>
}

/** 创建 WS 发射器（框架 messager 广播） */
export function createWsEmitter(msg: import('weifuwu').MessagerClient, departmentId: string): StreamEmitter {
  return {
    emit(event: StreamEvent) {
      msg.broadcast(String(departmentId), event)
    },
  }
}

/** 创建 SSE 发射器（写入 HTTP 响应） */
export function createSseEmitter(write: (chunk: string) => void): StreamEmitter {
  return {
    emit(event: StreamEvent) {
      write(`event: ${event.type}\n`)
      write(`data: ${JSON.stringify(event)}\n\n`)
    },
  }
}

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
  ctx: AppCtx,
  departmentId: string,
  senderId: string,
  messageContent: string,
): Promise<void> {
  const { sql } = ctx

  // 查找部门中所有 AI Agent
  const aiAgents = (await sql`
    SELECT a.id, a.name, a.system_prompt, a.model, a.tools, a.human_in_the_loop, a.max_tokens
    FROM department_members dm
    JOIN agents a ON a.id = dm.agent_id
    WHERE dm.department_id = ${departmentId}
      AND a.type = 'ai'
      AND a.is_active = TRUE
  `) as unknown as Array<Record<string, any>>

  // @ 定向发言：消息中 @Agent名 只触发目标 AI（无 @ 时全部回复）
  const mentioned: Record<string, string> = {}
  for (const m of messageContent.matchAll(/@([\u4e00-\u9fa5\w\-]+)/g)) {
    mentioned[m[1]] = m[1]
  }
  let targets = aiAgents
  if (Object.keys(mentioned).length > 0) {
    const hit = aiAgents.filter((a) => mentioned[String(a.name).trim()])
    if (hit.length > 0) targets = hit
  }

  if (aiAgents.length === 0) {
    // 无 AI 成员——插入系统提示（消除静默失败，引导用户添加 AI 成员）
    try {
      const [hint] = await sql`
        INSERT INTO messages (department_id, sender_id, content, msg_type)
        VALUES (${departmentId}, ${senderId}, '该群组暂无 AI 成员，消息不会得到自动回复。请到部门详情添加 AI 机器人。', 'system')
        RETURNING id, created_at
      `
      const hintMsg = hint as any
      ctx.msg.broadcast(String(departmentId), {
        type: 'new_message',
        message: {
          id: hintMsg.id, departmentId, sender_id: senderId, sender_name: '系统',
          sender_type: 'system', content: '该群组暂无 AI 成员，消息不会得到自动回复。请到部门详情添加 AI 机器人。',
          msg_type: 'system', created_at: hintMsg.created_at,
        },
      })
    } catch { /* 提示失败不阻断用户消息 */ }
    return
  }

  // 如果 API key 为占位符或未配置，跳过 AI 回复
  const apiKey = process.env.DEEPSEEK_API_KEY
  if (!apiKey || apiKey === '' || apiKey === 'sk-your-deepseek-api-key') {
    console.warn('[chat] DEEPSEEK_API_KEY 未配置，跳过 AI 自动回复')
    return
  }

  // 获取最近消息历史（逆序还原为正序）
  const recentMessages = (await sql`
    SELECT m.content, m.created_at, a.name as sender_name, a.type as sender_type
    FROM messages m
    JOIN agents a ON a.id = m.sender_id
    WHERE m.department_id = ${departmentId} AND m.ai_approved != FALSE
    ORDER BY m.created_at DESC
    LIMIT 20
  `) as unknown as Array<Record<string, any>>

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

  // 为每个 AI Agent 生成回复（@ 定向时只回复被 @ 的目标）
  for (const agent of targets) {
    try {
      const systemPrompt = agent.system_prompt ?? '你是一个有帮助的 AI 助手。'
      const tools = typeof agent.tools === 'string' ? JSON.parse(agent.tools) : (agent.tools ?? [])

      // 加载 Agent 已启用的技能
      const preloadedSkills: import('./skills.ts').SkillContext[] = []
      try {
        const agentSkills = (await sql`
          SELECT ask.skill_dir, ask.skill_name
          FROM agent_skills ask
          WHERE ask.agent_id = ${agent.id} AND ask.enabled = TRUE
        `) as unknown as Array<Record<string, any>>
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
        ctx.msg.broadcast(String(departmentId), {
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
        ctx.msg.broadcast(String(departmentId), {
          type: 'ai_reply',
          message: { id: replyMsg.id, agentId: agent.id, agentName: agent.name, content, departmentId, createdAt: replyMsg.created_at },
        })
      }
    } catch (err) {
      console.error(`[chat] Agent ${agent.id} error:`, err)
    }
  }
}

// ── 共享的 Agent 流式运行逻辑 ─────────────────────────

/**
 * 为单个 Agent 运行流式生成，通过 emitter 发射事件
 *
 * 1. 创建空消息占位
 * 2. 发射 thinking 事件
 * 3. 调用 streamAgent，将回调映射为 emitter.emit()
 * 4. 完成后发射 complete/error 事件
 * 5. 更新 DB（消息内容 + token 日志）
 */
async function runAgentStreamForAgent(
  ctx: AppCtx,
  departmentId: string,
  agent: any,
  chatMessages: import('../ai/types.ts').ChatMessage[],
  initialMsgId: string,  // WS 路径预创建的消息 ID；SSE 路径为 ''（内部创建）
  emit: StreamEmitter,
): Promise<void> {
  const { sql } = ctx
  const isExternalMsg = !!initialMsgId

  const systemPrompt = agent.system_prompt ?? '你是一个有帮助的 AI 助手。'
  const tools = typeof agent.tools === 'string' ? JSON.parse(agent.tools) : (agent.tools ?? [])
  const preloadedSkills = await loadAgentSkills(sql, agent.id, ctx)

  // 消息占位（SSE 路径在内部创建）
  let msgId = initialMsgId
  if (!msgId) {
    const [replyMsg] = await sql`
      INSERT INTO messages (department_id, sender_id, content, msg_type, ai_approved)
      VALUES (${departmentId}, ${agent.id}, '', 'text', TRUE)
      RETURNING id
    `
    msgId = String(replyMsg.id)
  }

  // 1) thinking
  emit.emit({ type: 'wf:step', messageId: msgId, agentId: agent.id, agentName: agent.name, stepType: 'llm' })

  let accumulatedContent = ''
  let streamFailed = false
  let hasEmittedGenerating = false
  let finalUsage: import('weifuwu').WfUsage | undefined
  // DB 写入串行链：onChunk 是 async 且未被 streamAgent await（agent-runner 裸调用
  // callbacks.onChunk），多个 chunk 的 UPDATE 并发执行 → SQL 乱序完成 → content 被
  // 中间值覆盖（真实 bug：DB 存"今天是 **2026"而前端已完成——刷新后仍截断）。
  // 链式保证 UPDATE 顺序；闭包在链执行时读最新 accumulatedContent → 收敛最终值。
  let dbWriteChain: Promise<unknown> = Promise.resolve()

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
      onChunk: (text: string) => {
        accumulatedContent += text
        // 先同步 emit（保序）：onChunk 是 async，若 await 写库后再 emit，
        // 多个 chunk 并发时 emit 顺序被 UPDATE 异步完成顺序打乱 → 前端 token 乱序/缺失
        emit.emit({ type: 'wf:token', messageId: msgId, text })
        // DB 写入串行化（防并发 UPDATE 乱序覆盖为中间值——流式截断根因）
        dbWriteChain = dbWriteChain.then(() =>
          sql`UPDATE messages SET content = ${accumulatedContent} WHERE id = ${msgId}`
        )
      },
      onToolCall: (toolCall: { name: string; args: string }) => {
        emit.emit({ type: 'wf:step', messageId: msgId, stepType: 'tool', name: toolCall.name, args: toolCall.args })
      },
      onToolResult: (result: { name: string; result: string }) => {
        emit.emit({ type: 'wf:tool_result', messageId: msgId, name: result.name, result: result.result })
      },
      onFinish: () => {
        // 每个流式步骤结束，不在此处发 complete
      },
    })
  } catch (err) {
    streamFailed = true
    console.error(`[chat] streamAgent ${agent.id} error:`, err)
  }

  // 完成后更新 DB + 发射 complete/error
  if (streamFailed) {
    if (!accumulatedContent) {
      await sql`DELETE FROM messages WHERE id = ${msgId} AND content = ''`
    }
    emit.emit({ type: 'wf:error', messageId: msgId, code: 'provider_error', message: 'AI 回复失败' })
  } else {
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
    emit.emit({ type: 'wf:done', messageId: msgId, content: accumulatedContent, usage: finalUsage })
  }

  // SSE 路径：关闭响应流
  if (!isExternalMsg) {
    // emitter 负责关闭（SSE 需写最后空行）
  }
}

/**
 * 共享初始化逻辑：检查 API key → 查找 AI Agent → 构建对话历史
 * 然后对每个 Agent 调用 runAgentStreamForAgent
 */
async function runAllAgents(
  ctx: AppCtx,
  departmentId: string,
  messageContent: string,
  initialMsgIds: string[],  // WS 路径：每个 agent 一个 msgId；SSE：[]
  createEmitter: (agent: any, msgId: string) => StreamEmitter,
): Promise<void> {
  const { sql } = ctx

  const apiKey = process.env.DEEPSEEK_API_KEY
  if (!apiKey || apiKey === '' || apiKey === 'sk-your-deepseek-api-key' || apiKey.startsWith('sk-your-')) {
    console.warn('[chat] DEEPSEEK_API_KEY 未配置，跳过 AI 自动回复')
    return
  }

  const aiAgents = (await sql`
    SELECT a.id, a.name, a.system_prompt, a.model, a.tools, a.human_in_the_loop, a.max_tokens,
      a.workspace_path, a.allow_file_tools, a.allow_command_exec
    FROM department_members dm
    JOIN agents a ON a.id = dm.agent_id
    WHERE dm.department_id = ${departmentId}
      AND a.type = 'ai'
      AND a.is_active = TRUE
  `) as unknown as Array<Record<string, any>>
  if (aiAgents.length === 0) return

  // @ 定向发言：消息中 @Agent名 只触发目标 AI（无 @ 或未命中时全部回复）
  let agents = aiAgents
  const mentioned: Set<string> = new Set()
  for (const m of messageContent.matchAll(/@([\u4e00-\u9fa5\w\-]+)/g)) {
    mentioned.add(m[1])
  }
  if (mentioned.size > 0) {
    const hit = aiAgents.filter((a) => mentioned.has(String(a.name).trim()))
    if (hit.length > 0) agents = hit
  }

  const recentMessages = (await sql`
    SELECT m.content, m.created_at, a.name as sender_name, a.type as sender_type
    FROM messages m
    JOIN agents a ON a.id = m.sender_id
    WHERE m.department_id = ${departmentId} AND m.ai_approved != FALSE
    ORDER BY m.created_at DESC
    LIMIT 20
  `) as unknown as Array<Record<string, any>>

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

  for (let i = 0; i < agents.length; i++) {
    const agent = agents[i]
    const msgId = initialMsgIds[i] ?? ''
    const emit = createEmitter(agent, msgId)

    if (agent.human_in_the_loop) {
      // HITL：非流式
      const result = await runAgent(ctx, {
        agentId: agent.id,
        tenantId: ctx.tenantId,
        departmentId,
        systemPrompt: agent.system_prompt ?? '你是一个有帮助的 AI 助手。',
        model: agent.model,
        tools: typeof agent.tools === 'string' ? JSON.parse(agent.tools) : (agent.tools ?? []),
        maxSteps: agent.max_tokens ? Math.min(agent.max_tokens, 20) : 10,
        humanInTheLoop: true,
        preloadedSkills: await loadAgentSkills(sql, agent.id, ctx),
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
      emit.emit({
        type: 'ai_draft' as any,
        message: { id: draftMsg.id, agentId: agent.id, agentName: agent.name, draft: content, departmentId, createdAt: new Date().toISOString() },
      } as any)
      continue
    }

    await runAgentStreamForAgent(ctx, departmentId, agent, chatMessages, msgId, emit)
  }
}

/**
 * WS 路径：消息已由 HTTP handler 创建，传 messageId
 */
export async function handleNewMessageStream(
  ctx: AppCtx,
  departmentId: string,
  senderId: string,
  messageContent: string,
  messageId: string,
): Promise<void> {
  // WS 路径：每个 agent 共享同一个 messageId
  // createEmitter 返回 WsEmitter
  // WS 路径：让 runAgentStreamForAgent 内部创建 AI 消息（而非复用用户消息 ID）
  await runAllAgents(ctx, departmentId, messageContent, [], (agent, msgId) => ({
    emit(event) { ctx.msg.broadcast(String(departmentId), event) },
  }))
}

/**
 * SSE 路径：HTTP 响应直接流式输出
 */
export async function handleNewMessageStreamSSE(
  ctx: AppCtx,
  departmentId: string,
  messageContent: string,
  write: (chunk: string) => void,
): Promise<void> {
  const sseEmitter: StreamEmitter = {
    emit(event) {
      write(`event: ${event.type}\n`)
      write(`data: ${JSON.stringify(event)}\n\n`)
    },
  }
  // SSE 路径：msgId 由 runAgentStreamForAgent 内部创建并设置到 event
  // 不强制覆盖 messageId
  await runAllAgents(ctx, departmentId, messageContent, [], (agent, msgId) => ({
    emit(event) { sseEmitter.emit(event) },
  }))
}

/**
 * 加载 Agent 的技能
 */
async function loadAgentSkills(sql: any, agentId: string, ctx: AppCtx): Promise<import('./skills.ts').SkillContext[]> {
  const preloadedSkills: import('./skills.ts').SkillContext[] = []
  try {
    const agentSkills = (await sql`
      SELECT skill_dir, skill_name FROM agent_skills
      WHERE agent_id = ${agentId} AND enabled = TRUE
    `) as unknown as Array<Record<string, any>>
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
