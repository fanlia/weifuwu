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
import { buildRosterText, buildHistoryContent, buildPersonaLayer, buildWorkspaceLayer, type RosterMember } from './persona.ts'
import { updateGroupMemory, buildGroupMemoryLayer } from './group-memory.ts'
import { findCachedAnswer, shouldCacheQuestion, buildCachedReply, isFailureAnswer } from './answer-cache.ts'
import { SkillRegistry, loadSkill } from './skills.ts'

// ── 流式事件类型 ───────────────────────────────────────

/**
 * 流式事件：框架 wf:* 协议（AI 回合事件）+ 应用层元数据（messageId/agentId）。
 * 业务事件（new_message/message_edited/message_deleted/ai_draft）仍为应用自有类型。
 */
/** 2026-12：惰性回复自动重试计数（防循环——每 agent 10 分钟窗口内最多重试 1 次） */
const retryCounts = new Map<string, { count: number; at: number }>()
function canAutoRetry(agentId: string): boolean {
  const r = retryCounts.get(agentId)
  if (!r || Date.now() - r.at > 10 * 60_000) {
    retryCounts.set(agentId, { count: 0, at: Date.now() })
    return true
  }
  if (r.count >= 1) return false
  r.count++
  return true
}

export interface StreamEvent {
  type: 'wf:step' | 'wf:token' | 'wf:tool_result' | 'wf:done' | 'wf:error' | 'wf:usage' | 'wf:verify'
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

/** 部门内 knowledge_base 成员（@ 定向用——KB 机器人检索回复，不调 LLM） */
async function loadKbMembers(ctx: AppCtx, departmentId: string): Promise<Array<Record<string, any>>> {
  const { sql } = ctx
  return (await sql`
    SELECT a.id, a.name
    FROM department_members dm
    JOIN agents a ON a.id = dm.agent_id
    WHERE dm.department_id = ${departmentId}
      AND a.type = 'knowledge_base'
      AND a.is_active = TRUE
  `) as unknown as Array<Record<string, any>>
}

/** @ 命中知识库机器人 → 检索 top3 拼接回复（纯确定性，不调 LLM）；无命中/相似度过低 → null */
async function kbReplyFor(ctx: AppCtx, kb: Record<string, any>, query: string, departmentId: string): Promise<string | null> {
  try {
    const { sql } = ctx
    // R3 计量收口：KB 检索也受计划配额约束（免费版到期/超限 → 不检索）
    const { planBlockReason } = await import('./plan.ts')
    const block = await planBlockReason(sql, ctx.appId)
    if (block) return block
    const embedding = await ctx.ai.embed(query)
    const vecStr = `[${embedding.join(',')}]`
    const chunks = (await sql`
      SELECT kc.content, kd.filename,
        1 - (kc.embedding <=> ${vecStr}::vector) as similarity
      FROM kb_chunks kc
      JOIN kb_documents kd ON kd.id = kc.document_id
      WHERE kc.agent_id = ${kb.id}
      ORDER BY kc.embedding <=> ${vecStr}::vector
      LIMIT 3
    `) as unknown as Array<Record<string, any>>
    const hits = chunks.filter((c) => Number(c.similarity) > 0.1)
    if (hits.length === 0) return null
    // R3：KB 检索计量（agent_logs 记录调用——配额/成本/ROI 口径一致）
    try {
      await sql`
        INSERT INTO agent_logs (agent_id, app_id, department_id, messages_count, steps_count, tokens_prompt, tokens_completion, tokens_total, elapsed_ms, success)
        VALUES (${kb.id}, ${ctx.appId}, ${departmentId}, 1, 0, 0, 0, 0, 50, true)
      `
    } catch { /* 计量失败不阻断检索 */ }
    return `📚 知识库检索结果（${kb.name}）：\n\n` + hits
      .map((c) => `【${c.filename}】${String(c.content).slice(0, 400)}`)
      .join('\n\n')
  } catch {
    return null
  }
}

/** 落一条 KB 检索回复消息 + WS 推送 */
async function persistKbReply(
  ctx: AppCtx, departmentId: string, kb: Record<string, any>, content: string,
): Promise<void> {
  const { sql } = ctx
  try {
    const [msg] = await sql`
      INSERT INTO messages (department_id, sender_id, content, msg_type, ai_approved)
      VALUES (${departmentId}, ${kb.id}, ${content}, 'text', TRUE)
      RETURNING id, created_at
    `
    ctx.msg.broadcast(String(departmentId), {
      type: 'ai_reply',
      message: { id: msg.id, agentId: kb.id, agentName: kb.name, content, departmentId, createdAt: msg.created_at },
    })
  } catch { /* KB 回复落库失败不阻断 */ }
}
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
      AND a.type IN ('ai', 'department')
      AND a.is_active = TRUE
  `) as unknown as Array<Record<string, any>>

  // @ 定向发言：消息中 @Agent名 只触发目标 AI（无 @ 时全部回复）
  const mentioned: Record<string, string> = {}
  for (const m of messageContent.matchAll(/@([\u4e00-\u9fa5\w\-]+)/g)) {
    mentioned[m[1]] = m[1]
  }
  let targets = aiAgents
  // O7 意图路由（Wave 2）：无 @ 且多 AI 成员时——语义匹配 top1（阈值 0.55）——
  // 只触发最合适的 Agent（省 token——不全员广播）；低相似度/无 AI/embed 失败
  // → 回退全部（现有行为不退化）。INTENT_ROUTE=off 关闭（回退广播）。
  let routedTo: string | null = null
  if (Object.keys(mentioned).length === 0 && aiAgents.length > 1 && process.env.INTENT_ROUTE !== 'off') {
    try {
      const { routeIntent } = await import('./intent-route.ts')
      // 形状适配：aiAgents（Record）→ RouteTarget（id/name/role_label/expertise）
      const r = await routeIntent(ctx, departmentId, messageContent, aiAgents.map((a) => ({
        id: String(a.id), name: String(a.name ?? ''),
        role_label: a.role_label ?? null, expertise: a.expertise ?? null,
      })))
      if (r.kind === 'routed' && r.agent) {
        targets = aiAgents.filter((a) => String(a.id) === String((r.agent as any).id))
        routedTo = String(r.agent.name)
      }
    } catch { /* 路由失败不阻断——回退全部 */ }
  }
  if (Object.keys(mentioned).length > 0) {
    const hit = aiAgents.filter((a) => mentioned[String(a.name).trim()])
    if (hit.length > 0) targets = hit
    else {
      // @ 未命中 ai——查是否命中知识库机器人（KB 检索回复，不调 LLM）
      const kbAgents = await loadKbMembers(ctx, departmentId)
      const kbHit = kbAgents.filter((a) => mentioned[String(a.name).trim()])
      if (kbHit.length > 0) {
        for (const kb of kbHit) {
          const reply = await kbReplyFor(ctx, kb, messageContent, departmentId)
          if (reply) await persistKbReply(ctx, departmentId, kb, reply)
        }
        return // @ KB 时只回复 KB，不触发 AI
      }
    }
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
    SELECT m.content, m.created_at, a.name as sender_name, a.type as sender_type,
      m.reply_to, r.content as reply_content, ra.name as reply_sender_name
    FROM messages m
    JOIN agents a ON a.id = m.sender_id
    LEFT JOIN messages r ON r.id = m.reply_to
    LEFT JOIN agents ra ON ra.id = r.sender_id
    WHERE m.department_id = ${departmentId} AND m.ai_approved != FALSE
    ORDER BY m.created_at DESC
    LIMIT 20
  `) as unknown as Array<Record<string, any>>

  // 构建 ChatMessage[] — 包含历史上下文（P1-1 署名 / P1-2 引用）
  const chatMessages: import('../ai/types.ts').ChatMessage[] = []
  for (const msg of recentMessages.reverse()) {
    if (msg.sender_type === 'user' || msg.sender_type === 'ai') {
      chatMessages.push({
        role: msg.sender_type === 'ai' ? 'assistant' : 'user',
        content: buildHistoryContent({
          content: msg.content,
          senderName: String(msg.sender_name ?? '未知'),
          replyTo: msg.reply_to ? { senderName: String(msg.reply_sender_name ?? '未知'), content: String(msg.reply_content ?? '') } : undefined,
        }),
      })
    }
  }
  // 追加当前消息
  chatMessages.push({ role: 'user', content: messageContent })

  // P0-2 同事名单
  const rosterMembers = (await sql`
    SELECT a.id, a.type, a.name, dm.role, a.role_label, a.expertise
    FROM department_members dm
    JOIN agents a ON a.id = dm.agent_id
    WHERE dm.department_id = ${departmentId}
  `) as unknown as RosterMember[]

  // 为每个 AI Agent 生成回复（@ 定向时只回复被 @ 的目标）
  for (const agent of targets) {
    try {
      const systemPrompt = (agent.system_prompt ?? '你是一个有帮助的 AI 助手。') + '\n\n' + buildPersonaLayer({
    rosterText: buildRosterText(rosterMembers, String(agent.id)),
    selfName: String(agent.name),
  })
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
        appId: ctx.appId,
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
    allowNetwork: agent.allow_network,
      }, chatMessages)

      // 保存回复消息
      const content = result.content
      if (!content) continue
      // AI 执行验证（2026-12 幻觉治理）：HITL 非流式路径同样校验声称产物
      const taskStartedAt = Date.now() // 任务开始时间（产物验证区分新旧）
      let verifiedContent = content
      try {
        const { extractArtifactPaths, verifyArtifacts, buildVerifyMark } = await import('./artifact-verify.ts')
        const claimed = extractArtifactPaths(content)
        // 执行归属部门（与流式路径一致）
        let verifyDeptId = String(departmentId)
        try {
          const [agRow] = await sql`SELECT department_id FROM agents WHERE id = ${agent.id}`
          if ((agRow as any)?.department_id) verifyDeptId = String((agRow as any).department_id)
        } catch { /* 查询失败用当前部门 */ }
        if (claimed.length > 0) {
          const { verified, missing, stale } = await verifyArtifacts(sql, verifyDeptId, claimed, taskStartedAt)
          if (verified.length > 0 || missing.length > 0 || stale.length > 0) {
            verifiedContent = content + buildVerifyMark(verified, missing, stale)
          }
        }
      } catch { /* 验证失败不阻断 */ }

      if (agent.human_in_the_loop) {
        // Human-in-the-Loop: 保存为草稿，待审批
        const [draftMsg] = await sql`
          INSERT INTO messages (department_id, sender_id, content, msg_type, ai_draft, ai_approved, ai_step)
          VALUES (${departmentId}, ${agent.id}, '[AI 生成中...]', 'text', ${verifiedContent}, NULL, ${JSON.stringify({ steps: result.steps })})
          RETURNING id, content, created_at
        `

        // WS 推送审批通知
        ctx.msg.broadcast(String(departmentId), {
          type: 'ai_draft',
          message: { id: draftMsg.id, agentId: agent.id, agentName: agent.name, draft: verifiedContent, departmentId, createdAt: draftMsg.created_at },
        })

        // 邮件通知租户 owner（商业化 G5——审批不打开页面也能收到提醒）
        try {
          const owners = await sql`
            SELECT u.email, u.name FROM _weifuwu_app_members m
            JOIN _weifuwu_users u ON u.id = m.user_id
            WHERE m.app_id = ${ctx.appId} AND m.role = 'owner'
          `
          for (const owner of owners as Array<{ email: string; name?: string }>) {
            if (!owner.email) continue
            const mailer = (ctx as any).email
            await mailer?.send?.({
              to: owner.email,
              subject: `[Agent Platform] 审批请求：${agent.name ?? 'AI Agent'} 需要您的确认`,
              text: `${agent.name ?? 'AI Agent'} 在部门对话中请求审批以下内容：\n\n${content.slice(0, 200)}${content.length > 200 ? '…' : ''}\n\n请登录平台处理：${process.env.PUBLIC_BASE_URL ?? 'https://localhost:3000'}/approvals`,
              html: `<p><b>${agent.name ?? 'AI Agent'}</b> 在部门对话中请求审批：</p><blockquote style="border-left:3px solid #4f6ef7;padding-left:12px;color:#555">${content.slice(0, 200)}${content.length > 200 ? '…' : ''}</blockquote><p><a href="${process.env.PUBLIC_BASE_URL ?? 'https://localhost:3000'}/approvals">前往审批 →</a></p>`,
            })
          }
        } catch { /* 邮件失败不阻断审批流程 */ }
      } else {
        // 自动回复（O8：routed_to 落库——路由指示随消息持久化——前端显示）
        // B1（2026-08）：ai_step 持久化工具步骤——刷新后工具条恢复（此前仅 WS 内存态——
        // 刷新丢失——工具失败视觉只实时可见——闭环缺口）
        const [replyMsg] = await sql`
          INSERT INTO messages (department_id, sender_id, content, msg_type, ai_approved, routed_to, ai_step)
          VALUES (${departmentId}, ${agent.id}, ${content}, 'text', TRUE, ${routedTo}, ${JSON.stringify({ steps: result.steps })}) 
          RETURNING id, content, created_at
        `

        // C5 配额 80% 告警（用量达阈值邮件 owner——每日一次）
        try {
          const { maybeAlertQuota } = await import('./quota-alert.ts')
          void maybeAlertQuota(ctx, ctx.appId)
        } catch { /* 告警失败不阻断 */ }

        // WS 推送（O8 路由指示：意图路由命中时带 routedTo——前端显示「任务派给 X」）
        ctx.msg.broadcast(String(departmentId), {
          type: 'ai_reply',
          message: { id: replyMsg.id, agentId: agent.id, agentName: agent.name, content, departmentId, createdAt: replyMsg.created_at },
          routedTo: routedTo ?? undefined,
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
  messageContent: string, // 原始消息（惰性回复重试的任务检测——真实 bug：未传参
  // 引用未定义变量 → ReferenceError → wf:done 未发 → 前端状态卡"生成中"）
  requestId = '', // 三端事件流（阶段 2）：requestId 跨端贯通
  emit: StreamEmitter,
  rosterMembers: RosterMember[] = [],
  attachmentLayer = '',
  groupMemoryLayer = '',
  runMessageId = '',
  workspaceLayer = '',
): Promise<void> {
  const { sql } = ctx
  const isExternalMsg = !!initialMsgId
  // 2026-12：任务开始时间（产物验证区分新旧——旧文件不算「已验证」）
  const taskStartedAt = Date.now()
  // 2026-12：工具调用计数（惰性回复检测——本轮 0 次工具调用 = 只回复计划）
  let toolCallCount = 0
  // P1-3：最近一次工具调用的 args（write/edit 文件变动广播用——工具名→args 映射）
  const lastToolArgs = new Map<string, Record<string, unknown>>()
  const lastToolArgsOf = (name: string): Record<string, unknown> | null => lastToolArgs.get(name) ?? null

  const systemPrompt = (agent.system_prompt ?? '你是一个有帮助的 AI 助手。') + '\n\n' + buildPersonaLayer({
    rosterText: buildRosterText(rosterMembers, String(agent.id)),
    selfName: String(agent.name),
  }) + (groupMemoryLayer ? '\n\n' + groupMemoryLayer : '') + (workspaceLayer ? '\n\n' + workspaceLayer : '') + (attachmentLayer ? '\n\n' + attachmentLayer : '')
  const tools = typeof agent.tools === 'string' ? JSON.parse(agent.tools) : (agent.tools ?? [])
  const preloadedSkills = await loadAgentSkills(sql, agent.id, ctx)

  // 消息占位（SSE 路径在内部创建）——msgId 在 try 外声明（B.1 兜底 catch 可访问）
  let msgId = initialMsgId
  try {
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

  // ── 计划拦截（G1 付费墙：试用到期 / 月配额用尽——租户级，先于 Agent 级配额） ──
  try {
    const { planBlockReason } = await import('./plan.ts')
    const reason = await planBlockReason(sql, ctx.appId)
    if (reason) {
      emit.emit({ type: 'wf:done', messageId: msgId, content: reason })
      return
    }
  } catch { /* 计划检查失败不阻断——保守放行 */ }

  // ── 配额检查（Wave 9 成本控制——月 token 上限，超限拒绝回复） ──
  try {
    const quota = Number(agent.monthly_token_quota ?? 0)
    if (quota > 0) {
      const [usedRow] = await sql`
        SELECT COALESCE(SUM(tokens_total), 0)::int AS used
        FROM agent_logs WHERE agent_id = ${agent.id} AND created_at >= DATE_TRUNC('month', NOW())
      `
      const used = Number((usedRow as any)?.used ?? 0)
      if (used >= quota) {
        emit.emit({ type: 'wf:done', messageId: msgId, content: `⚠️ 该 Agent 本月 token 配额（${quota.toLocaleString()}）已用尽，暂停自动回复。请在 Agent 详情调整配额或下月恢复。` })
        return
      }
    }
  } catch { /* 配额检查失败不阻断——保守放行 */ }

  let accumulatedContent = ''
  let streamFailed = false
  let hasEmittedGenerating = false
  let finalUsage: import('weifuwu').WfUsage | undefined
  // B1（2026-08）：流式路径工具步骤收集——ai_step 持久化（刷新后工具条恢复——
  // 含 error/done 状态——此前仅 WS 内存态——刷新丢失）
  const streamTools: Array<{ tool: string; args: string; result?: string; ok?: boolean; at: string }> = []
  // DB 写入串行链：onChunk 是 async 且未被 streamAgent await（agent-runner 裸调用
  // callbacks.onChunk），多个 chunk 的 UPDATE 并发执行 → SQL 乱序完成 → content 被
  // 中间值覆盖（真实 bug：DB 存"今天是 **2026"而前端已完成——刷新后仍截断）。
  // 链式保证 UPDATE 顺序；闭包在链执行时读最新 accumulatedContent → 收敛最终值。
  let dbWriteChain: Promise<unknown> = Promise.resolve()

  try {
    finalUsage = await streamAgent(ctx, {
      // 三端事件流（阶段 2）：requestId 跨端贯通（传给 emit 桥接——ai 事件带）
      requestId,
      agentId: agent.id,
      appId: ctx.appId,
      departmentId,
      runMessageId,
      systemPrompt,
      model: agent.model,
      tools,
      maxSteps: agent.max_tokens ? Math.min(agent.max_tokens, 20) : 10,
      humanInTheLoop: false,
      preloadedSkills,
      allowFileTools: agent.allow_file_tools,
      allowCommandExec: agent.allow_command_exec,
    allowNetwork: agent.allow_network,
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
        toolCallCount++
        streamTools.push({ tool: toolCall.name, args: toolCall.args, at: new Date().toISOString() })
        // P1-3：记录工具参数（write/edit 成功时广播 file_updated）
        try { lastToolArgs.set(String(toolCall.name), JSON.parse(String(toolCall.args ?? '{}'))) } catch { /* 解析失败跳过 */ }
      },
      onToolResult: (result: { name: string; result: string; ok: boolean; error?: string }) => {
        emit.emit({ type: 'wf:tool_result', messageId: msgId, name: result.name, result: result.result, ok: result.ok, error: result.error })
        // B1：结果合并进步骤（ok 标记——error 状态可持久化）
        for (let i = streamTools.length - 1; i >= 0; i--) {
          if (streamTools[i].tool === result.name && streamTools[i].result === undefined) {
            streamTools[i].result = result.result
            streamTools[i].ok = result.ok
            break
          }
        }
        // P1-3 文件变动事件：AI 写入/编辑文件 → 广播 file_updated（工作区交付物自动刷新）
        // 工具名 + args 来自 onToolCall（宿主侧已知——容器内 tool-runner 无需回传）
        try {
          if ((result.name === 'write' || result.name === 'edit') && !String(result.result ?? '').startsWith('写入失败') && !String(result.result ?? '').startsWith('编辑失败') && !String(result.result ?? '').includes('未找到匹配')) {
            const argsJson = lastToolArgsOf(String(result.name))
            const relPath = argsJson?.path ? String(argsJson.path) : ''
            if (relPath && !relPath.startsWith('..')) {
              try {
                if (ctx.msg?.broadcast) {
                  // 产物审批模式（2026-12）：部门开启时 AI 写入在待审区——事件带 pending 标记
                  // （前端文件卡片显示「待审批」+ 聊天流内直接批准/拒绝）——异步查询后广播
                  void sql`SELECT artifact_review FROM departments WHERE id = ${departmentId}`
                    .then((rows) => {
                      const pending = !!(rows?.[0] as any)?.artifact_review
                      if (ctx.msg?.broadcast) {
                        ctx.msg.broadcast(String(departmentId), {
                          type: 'file_updated',
                          file: relPath,
                          agentId: agent.id,
                          agentName: agent.name,
                          pending,
                        })
                      }
                    })
                    .catch(() => { /* 查询失败——补发无 pending 标记 */
                      if (ctx.msg?.broadcast) {
                        ctx.msg.broadcast(String(departmentId), {
                          type: 'file_updated', file: relPath, agentId: agent.id, agentName: agent.name, pending: false,
                        })
                      }
                    })
                }
              } catch { /* 广播失败不影响 */ }
            }
          }
        } catch { /* 事件尽力 */ }
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
      // 指标采集（/api/metrics——AI 调用次数/token/延迟）
      const m = (globalThis as any).__platform_metrics
      if (m) { m.aiCalls++; m.aiTokens += finalUsage.total_tokens ?? 0 }
      try {
        await sql`
          INSERT INTO agent_logs (agent_id, app_id, department_id, messages_count, steps_count,
            tokens_prompt, tokens_completion, tokens_total, elapsed_ms, success)
          VALUES (${agent.id}, ${ctx.appId}, ${departmentId},
            ${chatMessages.length}, 1,
            ${finalUsage.prompt_tokens}, ${finalUsage.completion_tokens}, ${finalUsage.total_tokens},
            0, TRUE)
        `
      } catch { /* 日志失败不影响主流程 */ }
    }
    // AI 执行验证（2026-12 幻觉治理）：回复完成后校验声称的产物是否存在——
    // 「声称完成」vs「实际完成」分开，用户可信任（追加标记到回复 + DB 落库）
    try {
      const { extractArtifactPaths, verifyArtifacts, buildVerifyMark } = await import('./artifact-verify.ts')
      const claimed = extractArtifactPaths(accumulatedContent)
      // 执行归属部门（角色在问卷调研被 @ 时产物写在 agents.department_id 的部门——验证也查那里）
      let verifyDeptId = String(departmentId)
      try {
        const [agRow] = await sql`SELECT department_id FROM agents WHERE id = ${agent.id}`
        if ((agRow as any)?.department_id) verifyDeptId = String((agRow as any).department_id)
      } catch { /* 查询失败用当前部门 */ }
      if (claimed.length > 0) {
        const { verified, missing, stale } = await verifyArtifacts(sql, verifyDeptId, claimed, taskStartedAt)
        if (verified.length > 0 || missing.length > 0 || stale.length > 0) {
          const mark = buildVerifyMark(verified, missing, stale)
          accumulatedContent = accumulatedContent + mark
          emit.emit({ type: 'wf:verify', messageId: msgId, verified, missing, stale })
          await sql`UPDATE messages SET content = ${accumulatedContent} WHERE id = ${msgId}`.catch(() => {})
        }
      }
    } catch { /* 验证失败不阻断 */ }

    // B1（2026-08）：流式路径工具步骤持久化（ai_step——刷新后工具条恢复）
    if (streamTools.length > 0) {
      try {
        await sql`UPDATE messages SET ai_step = ${JSON.stringify({ steps: streamTools })} WHERE id = ${msgId}`
      } catch { /* 失败不阻断流 */ }
    }
/** 任务消息检测（惰性回复重试的前置条件）：含任务指令词才重试——
 *  普通对话（你好/谢谢等）0 工具调用是正常回复——误判重试会让 AI 跑去
 *  执行浏览器任务（问卷填写群真实事故：用户说'你好'——5 个 AI 全被重试
 *  去打开问卷页——没有正常问候 stream 回复） */
function isTaskMessage(content: string): boolean {
  return /问卷|填写|任务|执行|处理|完成|汇总|打开|整理|分析|生成|创建|修改|提交|回复|总结|调研|统计|重试/.test(content)
}

    // 2026-12 可靠性：惰性回复检测——本轮 0 次工具调用 = AI 只回复计划没干活
    // （研发大刘演示事故：看到旧结果只回复「收到」不执行）→ 自动重发一次（防循环）
    if (toolCallCount === 0 && accumulatedContent.trim() && !streamFailed && isTaskMessage(messageContent)) {
      try {
        if (canAutoRetry(String(agent.id))) {
          const [sender] = await sql`SELECT id FROM agents WHERE app_id = ${ctx.appId} AND type = 'user' LIMIT 1`
          const senderId = sender ? String(sender.id) : 'system'
          const retryContent = `@${agent.name} 【系统自动重试】你上一轮只回复了计划、没有实际调用任何工具执行。请立即实际执行任务（调用工具完成），不要只回复计划。`
          const { handleNewMessageStream } = await import('./chat.ts')
          await sql`INSERT INTO messages (department_id, sender_id, content, msg_type, ai_approved)
            VALUES (${departmentId}, ${senderId}, ${retryContent}, 'system', TRUE)`
          console.warn(`[chat] ${agent.name} 惰性回复（0 工具调用）——自动重试`)
          void handleNewMessageStream(ctx, String(departmentId), senderId, retryContent, '').catch(() => {})
        }
      } catch { /* 重试失败不阻断 */ }
    }
    emit.emit({ type: 'wf:done', messageId: msgId, content: accumulatedContent, usage: finalUsage })
  }

  // SSE 路径：关闭响应流
  if (!isExternalMsg) {
    // emitter 负责关闭（SSE 需写最后空行）
  }
  } catch (err) {
    // B.1 跨层错误透明化：任何未覆盖异常（作用域/传参/运行时）→ wf:error 必达——
    // 否则前端永久卡"生成中"（真实事故：messageContent 未定义 ReferenceError
    // 逃逸 → wf:done/wf:error 都没发 → 前端 60s 兜底才恢复）
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[chat] runAgentStreamForAgent ${agent.id} error:`, msg)
    try {
      if (msgId) emit.emit({ type: 'wf:error', messageId: msgId, code: 'internal_error', message: msg.slice(0, 200) })
      else console.error(`[chat] msgId 未知——无法发 wf:error：${msg}`)
    } catch { /* 兜底失败不阻断 */ }
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
  requestId = '', // 三端事件流（阶段 2）：requestId 跨端贯通
  attachments: Array<{ name: string; path: string; size: number }> = [],  // P1-3 聊天附件
  attachmentMsgId = '',  // P1-3 用户消息 id（附件区目录名——WS 路径与 AI 回复占位 id 不同）
  createEmitter: (agent: any, msgId: string) => StreamEmitter,
): Promise<void> {
  const { sql } = ctx

  // 三层模型（2026-12）：部门 = 工作目录——附件/文件地图按部门 workspace 解析（单聊无目录）
  let deptWsInfo: { is_dm: boolean; workspace_path: string | null } | null = null
  try {
    const [dept] = await sql`SELECT is_dm, workspace_path FROM departments WHERE id = ${departmentId}`
    if (dept) deptWsInfo = { is_dm: !!dept.is_dm, workspace_path: dept.workspace_path ? String(dept.workspace_path) : null }
  } catch { /* 查询失败 → 无工作空间 */ }

  const apiKey = process.env.DEEPSEEK_API_KEY
  if (!apiKey || apiKey === '' || apiKey === 'sk-your-deepseek-api-key' || apiKey.startsWith('sk-your-')) {
    console.warn('[chat] DEEPSEEK_API_KEY 未配置，跳过 AI 自动回复')
    return
  }

  const aiAgents = (await sql`
    SELECT a.id, a.name, a.system_prompt, a.model, a.tools, a.human_in_the_loop, a.max_tokens,
      a.workspace_path, a.allow_file_tools, a.allow_command_exec, a.allow_network,
      a.workspace_path, a.allow_file_tools, a.allow_command_exec
    FROM department_members dm
    JOIN agents a ON a.id = dm.agent_id
    WHERE dm.department_id = ${departmentId}
      AND a.type IN ('ai', 'department')
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
    // @all / @所有人 / @全员 / @everyone：显式全员触发（@ 定向之外的通告语义）
    if (mentioned.has('all') || mentioned.has('所有人') || mentioned.has('everyone') || mentioned.has('全员')) {
      agents = aiAgents
      // 前端提示语（@all 已由 emit 处理——直接放行全员）
    } else {
    const hit = aiAgents.filter((a) => mentioned.has(String(a.name).trim()))
    if (hit.length > 0) agents = hit
    else {
      // @ 未命中 ai——查是否命中知识库机器人（KB 检索回复，不调 LLM）
      const kbAgents = await loadKbMembers(ctx, departmentId)
      // P1-3：带附件消息跳过 KB（KB 无沙盒/文件能力——避免'我无法处理文件'噪音）
      if (attachments.length > 0) {
        return
      }
      const kbHit = kbAgents.filter((a) => mentioned.has(String(a.name).trim()))
      if (kbHit.length > 0) {
        for (const kb of kbHit) {
          const reply = await kbReplyFor(ctx, kb, messageContent, departmentId)
          if (reply) await persistKbReply(ctx, departmentId, kb, reply)
        }
        return // @ KB 时只回复 KB，不触发 AI
      }
      // @ 完全未命中（非 AI 非 KB）——不触发任何成员（真实 bug：此前 fall
      // through 全员回复——小应被 @实习生阿泽 误触发并冒充身份）
      return
    }
    } // @all 之外的定向分支闭合
  }

  const recentMessages = (await sql`
    SELECT m.content, m.created_at, a.name as sender_name, a.type as sender_type,
      m.reply_to, r.content as reply_content, ra.name as reply_sender_name
    FROM messages m
    JOIN agents a ON a.id = m.sender_id
    LEFT JOIN messages r ON r.id = m.reply_to
    LEFT JOIN agents ra ON ra.id = r.sender_id
    WHERE m.department_id = ${departmentId} AND m.ai_approved != FALSE
    ORDER BY m.created_at DESC
    LIMIT 20
  `) as unknown as Array<Record<string, any>>

  const chatMessages: import('../ai/types.ts').ChatMessage[] = []
  for (const msg of recentMessages.reverse()) {
    if (msg.sender_type === 'user' || msg.sender_type === 'ai') {
      chatMessages.push({
        role: msg.sender_type === 'ai' ? 'assistant' : 'user',
        content: buildHistoryContent({
          content: msg.content,
          senderName: String(msg.sender_name ?? '未知'),
          replyTo: msg.reply_to ? { senderName: String(msg.reply_sender_name ?? '未知'), content: String(msg.reply_content ?? '') } : undefined,
        }),
      })
    }
  }
  chatMessages.push({ role: 'user', content: messageContent })

  // P0-2 同事名单（注入所有 AI 的 systemPrompt——分工共识）
  const rosterMembers = (await sql`
    SELECT a.id, a.type, a.name, dm.role, a.role_label, a.expertise
    FROM department_members dm
    JOIN agents a ON a.id = dm.agent_id
    WHERE dm.department_id = ${departmentId}
  `) as unknown as RosterMember[]
  const rosterText = buildRosterText(rosterMembers, '')

  // P4 群共识摘要（AI 记得群里决定过什么——记忆层闭环）
  let groupMemoryLayer = ''
  try {
    const [gm] = await sql`SELECT summary FROM group_memories WHERE department_id = ${departmentId}`
    if (gm?.summary) groupMemoryLayer = buildGroupMemoryLayer(String(gm.summary))
  } catch { /* 表不存在/查询失败——无群共识 */ }

  for (let i = 0; i < agents.length; i++) {
    const agent = agents[i]
    const msgId = initialMsgIds[i] ?? ''
    const emit = createEmitter(agent, msgId)

    // P1-3：附件拷贝到本 AI 工作空间 uploads/{msgId}/（沙盒 bind mount 自动可见）
    let attachmentLayer = ''
    let workspaceLayer = ''
    if (attachments.length > 0 && agent.allow_file_tools && deptWsInfo) {
      // 单聊（is_dm）也是部门特例——同样有工作目录（附件 AI 可见）
      const { buildAttachmentLayer } = await import('./upload.ts')
      const { resolveDepartmentWorkspace } = await import('../middleware/workspace.ts')
      const fs = await import('node:fs/promises')
      const pathMod = await import('node:path')
      const ws = await resolveDepartmentWorkspace(departmentId, deptWsInfo.workspace_path, true)
      if (ws) {
        const targetDir = pathMod.join(ws, 'uploads', attachmentMsgId)
        const attachBase = pathMod.join(process.cwd(), 'data', 'uploads', String(ctx.appId), String(departmentId))
        const copied: Array<{ name: string; size: number; path: string }> = []
        for (const att of attachments) {
          const src = pathMod.join(attachBase, attachmentMsgId, att.name)
          try {
            const buf = await fs.readFile(src)
            await fs.mkdir(targetDir, { recursive: true })
            await fs.writeFile(pathMod.join(targetDir, att.name), buf)
            copied.push({ name: att.name, size: att.size ?? buf.length, path: `uploads/${attachmentMsgId}/${att.name}` })
          } catch (e: any) {
            console.warn(`[chat] 附件拷贝失败 ${att.name}: ${e?.message ?? ''}`)
          }
        }
        attachmentLayer = buildAttachmentLayer(copied)
        // C3 增强：工作空间文件地图（AI 开局知道有什么——浅层扫描 2 层）
        try {
          const files: Array<{ path: string; size: number; mtime: string }> = []
          const scanDir = async (dir: string, prefix: string, depth: number) => {
            if (depth > 2) return
            const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => [])
            for (const e of entries) {
              const rel = prefix ? `${prefix}/${e.name}` : e.name
              if (e.isDirectory()) await scanDir(pathMod.join(dir, e.name), rel, depth + 1)
              else {
                const st = await fs.stat(pathMod.join(dir, e.name)).catch(() => null)
                files.push({ path: rel, size: st?.size ?? 0, mtime: st?.mtime?.toISOString() ?? '' })
              }
            }
          }
          await scanDir(ws, '', 0)
          files.sort((a, b) => a.path.localeCompare(b.path))
          workspaceLayer = buildWorkspaceLayer(files)
        } catch { /* 扫描失败——无文件地图 */ }
      }
    }

    if (agent.human_in_the_loop) {
      // HITL：非流式
      const result = await runAgent(ctx, {
        agentId: agent.id,
        appId: ctx.appId,
        departmentId,
        systemPrompt: (agent.system_prompt ?? '你是一个有帮助的 AI 助手。') + '\n\n' + buildPersonaLayer({ rosterText: buildRosterText(rosterMembers, String(agent.id)), selfName: String(agent.name) }) + (groupMemoryLayer ? '\n\n' + groupMemoryLayer : '') + (workspaceLayer ? '\n\n' + workspaceLayer : '') + (attachmentLayer ? '\n\n' + attachmentLayer : ''),
        model: agent.model,
        tools: typeof agent.tools === 'string' ? JSON.parse(agent.tools) : (agent.tools ?? []),
        maxSteps: agent.max_tokens ? Math.min(agent.max_tokens, 20) : 10,
        humanInTheLoop: true,
        preloadedSkills: await loadAgentSkills(sql, agent.id, ctx),
        allowFileTools: agent.allow_file_tools,
        allowCommandExec: agent.allow_command_exec,
    allowNetwork: agent.allow_network,
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

    // C1：runMessageId 用用户消息 id（attachmentMsgId——WS 路径 msgId 是 AI 回复占位）
    await runAgentStreamForAgent(ctx, departmentId, agent, chatMessages, msgId, messageContent, requestId, emit, rosterMembers, attachmentLayer, groupMemoryLayer, attachmentMsgId, workspaceLayer)
  }

  // C5 写缓存：AI 回复完成后（通用问题 → 存答案供后续相似问题秒回）
  void (async () => {
    try {
      if (!shouldCacheQuestion(messageContent)) return
      const [aiReply] = await ctx.sql`
        SELECT m.content FROM messages m
        JOIN agents a ON a.id = m.sender_id
        WHERE m.department_id = ${departmentId} AND a.type IN ('ai', 'department')
          AND m.content != '' AND m.content NOT LIKE '%来自缓存%'
        ORDER BY m.created_at DESC LIMIT 1
      `
      const answer = String(aiReply?.content ?? '').trim()
      // B2（2026-08）：失败/太短答案不入缓存（实证：AI 失败中间态被缓存——
      // 后续同类问题命中失败记录——毒化）——isFailureAnswer 锁定
      if (answer.length < 10 || isFailureAnswer(answer)) return
      await ctx.sql`
        INSERT INTO answer_cache (app_id, question, answer)
        VALUES (${ctx.appId}, ${messageContent.slice(0, 200)}, ${answer.slice(0, 2000)})
      `
    } catch { /* 缓存写入失败静默 */ }
  })()
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
  requestId = '', // 三端事件流（阶段 2）：requestId 跨端贯通（前端生成——精确因果）
): Promise<void> {
  // WS 路径：每个 agent 共享同一个 messageId
  // createEmitter 返回 WsEmitter
  // WS 路径：让 runAgentStreamForAgent 内部创建 AI 消息（而非复用用户消息 ID）
  // P1-3：读取消息附件元数据（uploads/{msgId}/xxx ——附件区相对路径）
  let attachments: Array<{ name: string; path: string; size: number }> = []
  try {
    const rows = await ctx.sql`SELECT attachments FROM messages WHERE id = ${messageId}`
    if (rows[0]?.attachments) attachments = typeof rows[0].attachments === 'string' ? JSON.parse(rows[0].attachments) : rows[0].attachments
  } catch { /* 无附件字段/查询失败——按无附件处理 */ }
  // P4 群共识：消息落库后异步提取（节流——每 20 条一次，不阻塞消息流）
  void updateGroupMemory(ctx, departmentId).catch(() => {})

  // ── C5 答案缓存：相似问题直接秒回（零 token） ──
  try {
    // 带附件/@定向消息不走缓存（任务语义唯一——@消息命中缓存会返回旧答案，
    // 真实 bug：小应冒充实习生的旧回复被缓存复用）
    // B2/B3（2026-08）：统一判定源——shouldCacheQuestion（含 @/文件/数据类排除）——
    // 写侧与读侧同规则（此前读侧只查 @——文件类旧缓存记录持续命中——订单.csv 3 次实证）
    if (!attachments.length && shouldCacheQuestion(messageContent)) {
      const cacheRows = (await ctx.sql`
        SELECT question, answer, hits FROM answer_cache WHERE app_id = ${ctx.appId}
        ORDER BY updated_at DESC LIMIT 200
      `) as unknown as Array<{ question: string; answer: string; hits: number }>
      const hit = findCachedAnswer(messageContent, cacheRows)
      if (hit) {
        await ctx.sql`UPDATE answer_cache SET hits = hits + 1, updated_at = NOW() WHERE app_id = ${ctx.appId} AND question = ${hit.question}`
        const [anyAi] = await ctx.sql`SELECT id FROM agents WHERE app_id = ${ctx.appId} AND type = 'ai' AND is_active = TRUE LIMIT 1`
        if (anyAi) {
          const [cachedMsg] = await ctx.sql`
            INSERT INTO messages (department_id, sender_id, content, msg_type, ai_approved)
            VALUES (${departmentId}, ${anyAi.id}, ${buildCachedReply(hit.answer, hit.hits + 1)}, 'text', TRUE)
            RETURNING id
          `
          const evt = { type: 'wf:done', messageId: String(cachedMsg.id), content: buildCachedReply(hit.answer, hit.hits + 1) }
          ctx.msg.broadcast(String(departmentId), evt)
        }
        return
      }
    }
  } catch { /* 缓存查询失败——走正常流程 */ }

  await runAllAgents(ctx, departmentId, messageContent, [], requestId, attachments, messageId, (agent, msgId) => ({
    emit(event) {
      ctx.msg.broadcast(String(departmentId), event)
      // HTTP/无 WS 路径：wf:done（配额/付费墙提示等非流式回复）直接落库——
      // 否则无 WS 连接时提示丢失，用户看到空回复（真实事故：demo 月配额用尽后 HTTP 测试全空）
      if (event.type === 'wf:done' && event.content) {
        void ctx.sql`UPDATE messages SET content = ${event.content} WHERE id = ${event.messageId} AND content = ''`.catch(() => {})
      }
    },
  }))
}

/**
 * SSE 路径：HTTP 响应直接流式输出
 */
export async function handleNewMessageStreamSSE(
  ctx: AppCtx,
  departmentId: string,
  messageContent: string,
  requestId = '', // 三端事件流（阶段 2）：requestId 跨端贯通
  write: (chunk: string) => void,
): Promise<void> {
  // P1-3 SSE 路径：从最近一条消息取附件
  let sseAttachments: Array<{ name: string; path: string; size: number }> = []
  try {
    const rows = await ctx.sql`SELECT attachments FROM messages WHERE department_id = ${departmentId} AND sender_id IS NOT NULL ORDER BY created_at DESC LIMIT 1`
    if (rows[0]?.attachments) sseAttachments = typeof rows[0].attachments === 'string' ? JSON.parse(rows[0].attachments) : rows[0].attachments
  } catch { /* 无附件 */ }
  const sseEmitter: StreamEmitter = {
    emit(event) {
      write(`event: ${event.type}\n`)
      write(`data: ${JSON.stringify(event)}\n\n`)
    },
  }
  // SSE 路径：msgId 由 runAgentStreamForAgent 内部创建并设置到 event
  // 不强制覆盖 messageId
  await runAllAgents(ctx, departmentId, messageContent, [], requestId, sseAttachments, '', (agent, msgId) => ({
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
