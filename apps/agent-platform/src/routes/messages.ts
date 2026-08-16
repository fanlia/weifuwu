/**
 * 消息路由 — 发送/获取消息
 */

import type { Router, Context } from 'weifuwu'
import type { AppCtx } from '../middleware/ctx.ts'
import { handleNewMessage, handleNewMessageStream, handleNewMessageStreamSSE } from '../services/chat.ts'

export function registerMessageRoutes(app: Router<AppCtx>): void {
  // ── 审批待办（租户内全部待批草稿，供管理员集中处理） ──────────

  app.get('/api/messages/pending-approvals', async (req: Request, ctx: AppCtx): Promise<Response> => {
    const { sql, appId } = ctx
    const pending = await sql`
      SELECT m.id, m.department_id, m.content, m.ai_draft, m.created_at,
        a.name as agent_name, a.type as agent_type,
        d.name as department_name
      FROM messages m
      JOIN agents a ON a.id = m.sender_id
      JOIN departments d ON d.id = m.department_id
      WHERE a.app_id = ${appId}
        AND m.ai_draft IS NOT NULL AND m.ai_approved IS NULL
      ORDER BY m.created_at DESC
      LIMIT 50
    `
    return Response.json({ pending })
  })

  // ── 获取消息列表 ─────────────────────────────────────────

  app.get('/api/departments/:id/messages', async (req: Request, ctx: AppCtx): Promise<Response> => {
    const { sql, appId, params } = ctx
    const url = new URL(req.url)
    const limit = parseInt(url.searchParams.get('limit') ?? '50', 10)
    const before = url.searchParams.get('before') // cursor 分页
    const q = url.searchParams.get('q')?.trim() ?? '' // 消息搜索

    // 验证部门存在
    const [dept] = await sql`
      SELECT d.id FROM departments d
      WHERE d.id = ${params.id} AND d.app_id = ${appId}
    `
    if (!dept) {
      return Response.json({ error: '部门不存在' }, { status: 404 })
    }

    const messages = await sql`
      SELECT
        m.id, m.department_id, m.sender_id, m.content, m.msg_type,
        m.ai_draft, m.ai_approved, m.created_at, m.reply_to, m.attachments,
        a.name as sender_name, a.type as sender_type, a.avatar_url as sender_avatar,
        r.content as reply_content, ra.name as reply_sender
      FROM messages m
      LEFT JOIN agents a ON a.id = m.sender_id
      LEFT JOIN messages r ON r.id = m.reply_to
      LEFT JOIN agents ra ON ra.id = r.sender_id
      WHERE m.department_id = ${params.id}
      ${before ? sql`AND m.created_at < (SELECT created_at FROM messages WHERE id = ${before})` : sql``}
      ${q ? sql`AND m.content ILIKE ${'%' + q + '%'}` : sql``}
      ORDER BY m.created_at DESC
      LIMIT ${limit}
    `

    return Response.json({ messages })
  })

  // ── 发送消息 ─────────────────────────────────────────────

  app.post('/api/departments/:id/messages', async (req: Request, ctx: AppCtx): Promise<Response> => {
    // R4 权限：viewer 只读——不能发消息
    try {
      const { requireWriter } = await import('../services/permissions.ts')
      await requireWriter(ctx)
    } catch (e: any) {
      return Response.json({ error: e?.message ?? '无权操作' }, { status: e?.status ?? 403 })
    }
    const { sql, appId, auth, params } = ctx
    const body = await req.json() as {
      content: string
      msg_type?: string
      reply_to?: string
      attachments?: Array<{ name: string; data: string; size?: number }>
    }

    if (!body.content && (!body.attachments || body.attachments.length === 0)) {
      return Response.json({ error: 'content 为必填' }, { status: 400 })
    }

    // 消息长度上限（后端强制——防无界入库 + AI 上下文浪费）
    const content = String(body.content ?? '').slice(0, 5000)
    const requestId = String((body as any).request_id ?? '')

    // 验证发件人 agent（当前用户绑定的 agent）
    let [sender] = await sql`
      SELECT id FROM agents
      WHERE app_id = ${appId} AND type = 'user' AND user_id = ${auth!.userId}
    `
    if (!sender) {
      // 自愈：老用户缺少绑定 agent 时自动创建
      const [u] = await sql`SELECT name FROM _weifuwu_users WHERE id = ${auth!.userId}`
      ;[sender] = await sql`
        INSERT INTO agents (app_id, type, name, user_id, is_active)
        VALUES (${appId}, 'user', ${u?.name ?? '用户'}, ${auth!.userId}, true)
        RETURNING id
      `
    }

    // 验证部门存在且用户是成员
    const [membership] = await sql`
      SELECT 1 FROM department_members dm
      JOIN departments d ON d.id = dm.department_id
      WHERE d.app_id = ${appId}
        AND dm.department_id = ${params.id}
        AND dm.agent_id = ${sender.id}
    `
    if (!membership) {
      return Response.json({ error: '你不是该部门的成员' }, { status: 403 })
    }

    // P1-3 附件：校验（白名单/大小/消毒）→ 落盘附件区 data/uploads/{app_id}/{dept}/{msg_id}/
    let attachmentMeta: Array<{ name: string; path: string; size: number; ext: string }> | null = null
    if (body.attachments && body.attachments.length > 0) {
      const { validateUploadFile } = await import('../services/upload.ts')
      const fs = await import('node:fs/promises')
      const pathMod = await import('node:path')
      const [message] = (await sql`
        INSERT INTO messages (department_id, sender_id, content, msg_type, reply_to)
        VALUES (${params.id}, ${sender.id}, ${content}, ${body.msg_type ?? 'text'}, ${body.reply_to ?? null})
        RETURNING id
      `) as unknown as Array<Record<string, any>>
      const attachDir = pathMod.join(process.cwd(), 'data', 'uploads', String(appId), String(params.id), String(message.id))
      await fs.mkdir(attachDir, { recursive: true })
      attachmentMeta = []
      for (const f of body.attachments) {
        try {
          const v = validateUploadFile(f)
          await fs.writeFile(pathMod.join(attachDir, v.safeName), v.buffer)
          attachmentMeta.push({ name: v.safeName, path: `uploads/${String(message.id)}/${v.safeName}`, size: v.size, ext: v.ext })
        } catch (e: any) {
          // 单个附件失败：清理已写文件 + 拒绝整条消息（防半截附件）
          await fs.rm(attachDir, { recursive: true, force: true }).catch(() => {})
          return Response.json({ error: `附件「${f?.name ?? ''}」无效：${e?.message ?? '未知错误'}` }, { status: 400 })
        }
      }
      await sql`UPDATE messages SET attachments = ${JSON.stringify(attachmentMeta)} WHERE id = ${message.id}`
      ;(message as any).content = content
      ;(message as any).msg_type = body.msg_type ?? 'text'
      ;(message as any).created_at = new Date().toISOString()
      // WS 推送 + 异步回复继续走下方公共代码
      ctx.msg.broadcast(String(params.id), {
        type: 'new_message',
        departmentId: params.id,
        message: { id: message.id, sender_id: message.sender_id, content: message.content, attachments: attachmentMeta },
      })
      handleNewMessageStream(ctx, params.id, String(sender.id), content, String(message.id), requestId).catch((err) =>
        console.error('[messages] handleNewMessageStream error:', err),
      )
      return Response.json({ message }, { status: 201 })
    }

    const [message] = (await sql`
      INSERT INTO messages (department_id, sender_id, content, msg_type, reply_to)
      VALUES (${params.id}, ${sender.id}, ${content}, ${body.msg_type ?? 'text'}, ${body.reply_to ?? null})
      RETURNING id, department_id, sender_id, content, msg_type, created_at
    `) as unknown as Array<Record<string, any>>

    // WebSocket 推送新消息
    ctx.msg.broadcast(String(params.id), {
      type: 'new_message',
      departmentId: params.id,
      message: { id: message.id, sender_id: message.sender_id, content: message.content },
    })

    // 异步触发 AI 自动回复（不阻塞 HTTP 响应）
    const deepseekKey = process.env.DEEPSEEK_API_KEY
    if (deepseekKey && deepseekKey !== 'sk-your-deepseek-api-key' && !deepseekKey.startsWith('sk-your-')) {
      // 流式：先创建占位消息再触发
      handleNewMessageStream(ctx, params.id, String(sender.id), body.content, message.id, requestId).catch((err) =>
        console.error('[messages] handleNewMessageStream error:', err),
      )
    }

    return Response.json({ message }, { status: 201 })
  })

  // ── SSE 流式发送消息（调试用） ────────────────────────────
  //
  // POST /api/departments/:id/messages/stream
  // 与 /messages 相同但返回 SSE 流而非 JSON。
  // 可直接用 curl 测试：
  //   curl -N -X POST .../messages/stream \
  //     -H 'Authorization: Bearer $TOKEN' \
  //     -H 'Content-Type: application/json' \
  //     -d '{"content":"现在几点"}'

  app.post('/api/departments/:id/messages/stream', async (req: Request, ctx: AppCtx): Promise<Response> => {
    const { sql, appId, auth, params } = ctx
    const body = await req.json() as { content: string }

    if (!body.content) {
      return Response.json({ error: 'content 为必填' }, { status: 400 })
    }

    // 消息长度上限（后端强制——防无界入库 + AI 上下文浪费）
    const content = String(body.content).slice(0, 5000)

    // 验证发件人 agent
    let [sender] = await sql`
      SELECT id FROM agents
      WHERE app_id = ${appId} AND type = 'user' AND user_id = ${auth!.userId}
    `
    if (!sender) {
      const [u] = await sql`SELECT name FROM _weifuwu_users WHERE id = ${auth!.userId}`
      ;[sender] = await sql`
        INSERT INTO agents (app_id, type, name, user_id, is_active)
        VALUES (${appId}, 'user', ${u?.name ?? '用户'}, ${auth!.userId}, true)
        RETURNING id
      `
    }

    // 验证成员资格
    const [membership] = await sql`
      SELECT 1 FROM department_members dm
      JOIN departments d ON d.id = dm.department_id
      WHERE d.app_id = ${appId}
        AND dm.department_id = ${params.id}
        AND dm.agent_id = ${sender.id}
    `
    if (!membership) {
      return Response.json({ error: '你不是该部门的成员' }, { status: 403 })
    }

    // 创建消息
    const [message] = await sql`
      INSERT INTO messages (department_id, sender_id, content, msg_type)
      VALUES (${params.id}, ${sender.id}, ${body.content}, 'text')
      RETURNING id, department_id, sender_id, content, msg_type, created_at
    `

    // WS 推送新消息（让其他 WS 客户端也能看到）
    ctx.msg.broadcast(String(params.id), {
      type: 'new_message',
      departmentId: params.id,
      message: { id: message.id, sender_id: message.sender_id, content: message.content },
    })

    const deepseekKey = process.env.DEEPSEEK_API_KEY
    const hasValidKey = deepseekKey && deepseekKey !== 'sk-your-deepseek-api-key' && !deepseekKey.startsWith('sk-your-')

    if (!hasValidKey) {
      return new Response(
        `event: error\ndata: {"error":"DEEPSEEK_API_KEY 未配置"}\n\n`,
        { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' } },
      )
    }

    // SSE 响应流
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder()
        const write = (chunk: string) => controller.enqueue(encoder.encode(chunk))

        // 初始消息 ID
        write(`event: meta\ndata: {"messageId":"${message.id}"}\n\n`)

        await handleNewMessageStreamSSE(ctx, params.id, body.content, '', write)

        controller.close()
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    })
  })

  // ── 编辑消息（5 分钟内可编辑） ───────────────────────────

  app.put('/api/messages/:id', async (req: Request, ctx: AppCtx): Promise<Response> => {
    const { sql, appId, auth, params } = ctx
    const body = await req.json() as { content: string }

    if (!body.content?.trim()) {
      return Response.json({ error: 'content 不能为空' }, { status: 400 })
    }

    // 查找消息，验证属于同一租户
    const [msg] = await sql`
      SELECT m.id, m.sender_id, m.created_at, m.department_id, a.user_id as owner_user_id, a.app_id
      FROM messages m
      JOIN agents a ON a.id = m.sender_id
      WHERE m.id = ${params.id} AND a.app_id = ${appId}
    `
    if (!msg) {
      return Response.json({ error: '消息不存在' }, { status: 404 })
    }

    // 仅消息发送者可编辑
    if (msg.owner_user_id !== auth!.userId) {
      return Response.json({ error: '只能编辑自己的消息' }, { status: 403 })
    }

    // 5 分钟内可编辑
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000)
    if (new Date(String(msg.created_at)) < fiveMinutesAgo) {
      return Response.json({ error: '消息已超过 5 分钟，无法编辑' }, { status: 400 })
    }

    await sql`
      UPDATE messages SET content = ${body.content.trim()}
      WHERE id = ${params.id}
    `

    // WS 推送编辑事件
    ctx.msg.broadcast(String(String(msg.department_id)), {
      type: 'message_edited',
      messageId: params.id,
      content: body.content.trim(),
    })

    return Response.json({ success: true })
  })

  // ── 删除消息（撤回） ───────────────────────────────────────

  app.delete('/api/messages/:id', async (req: Request, ctx: AppCtx): Promise<Response> => {
    const { sql, appId, auth, params } = ctx

    const [msg] = await sql`
      SELECT m.id, m.sender_id, m.created_at, a.user_id as owner_user_id, m.department_id
      FROM messages m
      JOIN agents a ON a.id = m.sender_id
      WHERE m.id = ${params.id} AND a.app_id = ${appId}
    `
    if (!msg) {
      return Response.json({ error: '消息不存在' }, { status: 404 })
    }

    // 权限：发送者可撤回（5 分钟）；管理员（owner/admin）可删除任意消息（不限时）
    const isOwner = msg.owner_user_id === auth!.userId
    const isAdmin = auth!.role === 'owner' || auth!.role === 'admin'
    if (!isOwner && !isAdmin) {
      return Response.json({ error: '只能撤回自己的消息' }, { status: 403 })
    }

    // 非管理员撤回限 5 分钟内；管理员删除不限
    if (!isAdmin) {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000)
      if (new Date(String(msg.created_at)) < fiveMinutesAgo) {
        return Response.json({ error: '消息已超过 5 分钟，无法撤回' }, { status: 400 })
      }
    }

    await sql`DELETE FROM messages WHERE id = ${params.id}`

    // WS 推送删除事件
    ctx.msg.broadcast(String(String(msg.department_id)), {
      type: 'message_deleted',
      messageId: params.id,
    })

    return Response.json({ success: true })
  })

  // ── 消息反馈（R6 质量闭环：AI 回复点赞/点踩） ─────────────

  app.post('/api/messages/:id/feedback', async (req: Request, ctx: AppCtx): Promise<Response> => {
    const { sql, appId, params } = ctx
    const body = await req.json() as { feedback?: string }
    const fb = body.feedback === 'like' || body.feedback === 'dislike' ? body.feedback
      : body.feedback === null || body.feedback === '' ? null
      : undefined
    if (fb === undefined) {
      return Response.json({ error: 'feedback 必须是 like/dislike/null' }, { status: 400 })
    }
    // 校验消息属于租户且是 AI 回复
    const [msg] = await sql`
      SELECT m.id FROM messages m
      JOIN agents a ON a.id = m.sender_id
      WHERE m.id = ${params.id} AND a.app_id = ${appId} AND a.type = 'ai'
    `
    if (!msg) {
      return Response.json({ error: '消息不存在' }, { status: 404 })
    }
    await sql`UPDATE messages SET feedback = ${fb} WHERE id = ${params.id}`
    return Response.json({ success: true, feedback: fb })
  })

  // ── 草稿编辑（R6 质量闭环：审批人可修改 AI 草稿后批准） ───

  app.put('/api/messages/:id/draft', async (req: Request, ctx: AppCtx): Promise<Response> => {
    const { sql, appId, params, auth } = ctx
    const body = await req.json() as { draft?: string }
    const draft = String(body.draft ?? '').trim()
    if (!draft) {
      return Response.json({ error: '草稿不能为空' }, { status: 400 })
    }
    // 校验消息归属租户 + 待审批
    const [msg] = await sql`
      SELECT m.id, m.department_id, m.ai_draft FROM messages m
      JOIN agents a ON a.id = m.sender_id
      WHERE m.id = ${params.id} AND a.app_id = ${appId} AND m.ai_approved IS NULL
    `
    if (!msg) {
      return Response.json({ error: '草稿不存在或已处理' }, { status: 404 })
    }
    // 权限：部门管理员（同审批）
    const [caller] = await sql`
      SELECT dm.role FROM department_members dm
      JOIN agents ua ON ua.id = dm.agent_id
      WHERE dm.department_id = ${msg.department_id} AND ua.user_id = ${auth!.userId}
      LIMIT 1
    `
    const [callerOwner] = await sql`
      SELECT role FROM _weifuwu_app_members WHERE app_id = ${appId} AND user_id = ${auth!.userId}
    `
    if ((!caller || caller.role !== 'admin') && callerOwner?.role !== 'owner') {
      return Response.json({ error: '只有部门管理员可以编辑草稿' }, { status: 403 })
    }
    await sql`UPDATE messages SET ai_draft = ${draft} WHERE id = ${params.id}`
    try {
      const { writeAudit } = await import('../services/audit.ts')
      await writeAudit(ctx as any, { action: 'approval_draft_edit', target_type: 'message', target_id: String(params.id), detail: {} })
    } catch { /* 尽力 */ }
    return Response.json({ success: true })
  })

  // ── 审批 AI 回复（Human-in-the-Loop） ────────────────────

  app.post('/api/messages/:id/approve', async (req: Request, ctx: AppCtx): Promise<Response> => {
    const { sql, appId, params, auth } = ctx
    const body = await req.json() as { approved: boolean; reason?: string }

    const [msg] = await sql`
      SELECT m.id, m.ai_draft, m.ai_approved, m.department_id
      FROM messages m
      JOIN agents a ON a.id = m.sender_id
      WHERE m.id = ${params.id} AND a.app_id = ${appId}
    `
    if (!msg) {
      return Response.json({ error: '消息不存在' }, { status: 404 })
    }

    if (msg.ai_approved !== null) {
      return Response.json({ error: '该消息已审批' }, { status: 400 })
    }

    // 审批权限：仅部门管理员可批（部门内 role='admin' 的成员）
    const [approver] = await sql`
      SELECT dm.role
      FROM department_members dm
      JOIN agents ua ON ua.id = dm.agent_id
      WHERE dm.department_id = ${msg.department_id}
        AND ua.user_id = ${auth!.userId}
      LIMIT 1
    `
    if (!approver || approver.role !== 'admin') {
      return Response.json({ error: '只有部门管理员可以审批' }, { status: 403 })
    }

    if (body.approved) {
      // 批准 — 将草稿发布为正式消息
      await sql`
        UPDATE messages
        SET content = ai_draft, ai_approved = TRUE
        WHERE id = ${params.id}
      `
    } else {
      // 拒绝
      await sql`
        UPDATE messages
        SET ai_approved = FALSE, ai_draft = NULL
        WHERE id = ${params.id}
      `
    }

    return Response.json({ success: true, approved: body.approved })
  })

  // ── C1 断点续跑：从上次执行断点继续 ───────────────────────
  app.post('/api/messages/:id/continue', async (req: Request, ctx: AppCtx): Promise<Response> => {
    const { sql, appId, params } = ctx
    const [msg] = await sql`
      SELECT m.id, m.department_id, m.content
      FROM messages m
      JOIN agents a ON a.id = m.sender_id
      WHERE m.id = ${params.id} AND a.app_id = ${appId} AND a.type = 'user'
    `
    if (!msg) return Response.json({ error: '消息不存在' }, { status: 404 })

    // 查上次执行状态（步骤清单——断点）
    const [state] = await sql`
      SELECT steps, status FROM agent_run_states WHERE message_id = ${params.id}
    `
    const steps = Array.isArray(state?.steps) ? state.steps : []
    const doneSteps = steps.filter((st: any) => st?.result !== undefined).length

    // 续跑提示（注入 AI 上下文——从中断处继续，不重做已完成步骤）
    const resumeHint = steps.length > 0
      ? `\n\n【断点续跑】这条消息上次执行中断（已完成 ${doneSteps}/${steps.length} 步工具调用）。已执行步骤：${steps.map((st: any) => `${st.tool}(${String(st.args ?? '').slice(0, 60)})`).join(' → ')}。请从中断处继续完成用户请求，不要重复执行已完成步骤。`
      : ''

    // 复用消息流：重发原内容 + 续跑提示（handleNewMessageStream 重新触发 AI）
    const { handleNewMessageStream } = await import('../services/chat.ts')
    handleNewMessageStream(ctx, String(msg.department_id), 'system', String(msg.content) + resumeHint, String(msg.id), '').catch((err: any) =>
      console.error('[messages] continue error:', err),
    )
    return Response.json({ success: true, resumed: true, doneSteps, totalSteps: steps.length })
  })
}
