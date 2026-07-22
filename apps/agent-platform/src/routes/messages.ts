/**
 * 消息路由 — 发送/获取消息
 */

import type { Router, Context } from 'weifuwu'
import { handleNewMessage } from '../services/chat.ts'
import { wsHub } from '../services/ws-hub.ts'

export function registerMessageRoutes(app: Router): void {
  // ── 获取消息列表 ─────────────────────────────────────────

  app.get('/api/departments/:id/messages', async (req: Request, ctx: Context): Promise<Response> => {
    const { sql, tenantId, params } = ctx
    const url = new URL(req.url)
    const limit = parseInt(url.searchParams.get('limit') ?? '50', 10)
    const before = url.searchParams.get('before') // cursor 分页

    // 验证部门存在
    const [dept] = await sql`
      SELECT d.id FROM departments d
      JOIN companies c ON c.id = d.company_id
      WHERE d.id = ${params.id} AND c.tenant_id = ${tenantId}
    `
    if (!dept) {
      return Response.json({ error: '部门不存在' }, { status: 404 })
    }

    const messages = await sql`
      SELECT
        m.id, m.department_id, m.sender_id, m.content, m.msg_type,
        m.ai_draft, m.ai_approved, m.created_at,
        a.name as sender_name, a.type as sender_type, a.avatar_url as sender_avatar
      FROM messages m
      JOIN agents a ON a.id = m.sender_id
      WHERE m.department_id = ${params.id}
      ${before ? sql`AND m.created_at < (SELECT created_at FROM messages WHERE id = ${before})` : sql``}
      ORDER BY m.created_at DESC
      LIMIT ${limit}
    `

    return Response.json({ messages })
  })

  // ── 发送消息 ─────────────────────────────────────────────

  app.post('/api/departments/:id/messages', async (req: Request, ctx: Context): Promise<Response> => {
    const { sql, tenantId, auth, params } = ctx
    const body = await req.json() as {
      content: string
      msg_type?: string
      reply_to?: string
    }

    if (!body.content) {
      return Response.json({ error: 'content 为必填' }, { status: 400 })
    }

    // 验证发件人 agent（当前用户绑定的 agent）
    let [sender] = await sql`
      SELECT id FROM agents
      WHERE tenant_id = ${tenantId} AND type = 'user' AND user_id = ${auth!.userId}
    `
    if (!sender) {
      // 自愈：老用户缺少绑定 agent 时自动创建
      const [u] = await sql`SELECT name FROM users WHERE id = ${auth!.userId}`
      ;[sender] = await sql`
        INSERT INTO agents (tenant_id, type, name, user_id, is_active)
        VALUES (${tenantId}, 'user', ${u?.name ?? '用户'}, ${auth!.userId}, true)
        RETURNING id
      `
    }

    // 验证部门存在且用户是成员
    const [membership] = await sql`
      SELECT 1 FROM department_members dm
      JOIN departments d ON d.id = dm.department_id
      JOIN companies c ON c.id = d.company_id
      WHERE dm.department_id = ${params.id}
        AND dm.agent_id = ${sender.id}
        AND c.tenant_id = ${tenantId}
    `
    if (!membership) {
      return Response.json({ error: '你不是该部门的成员' }, { status: 403 })
    }

    const [message] = await sql`
      INSERT INTO messages (department_id, sender_id, content, msg_type, reply_to)
      VALUES (${params.id}, ${sender.id}, ${body.content}, ${body.msg_type ?? 'text'}, ${body.reply_to ?? null})
      RETURNING id, department_id, sender_id, content, msg_type, created_at
    `

    // 触发 Agent 自动回复（异步，不阻塞响应）
    handleNewMessage(ctx, params.id, sender.id, body.content).catch((err) =>
      console.error('[messages] handleNewMessage error:', err),
    )

    // WebSocket 实时推送新消息
    wsHub.broadcast(params.id, {
      type: 'new_message',
      departmentId: params.id,
      message: { id: message.id, sender_id: message.sender_id, content: message.content },
    })

    return Response.json({ message }, { status: 201 })
  })

  // ── 编辑消息（5 分钟内可编辑） ───────────────────────────

  app.put('/api/messages/:id', async (req: Request, ctx: Context): Promise<Response> => {
    const { sql, tenantId, auth, params } = ctx
    const body = await req.json() as { content: string }

    if (!body.content?.trim()) {
      return Response.json({ error: 'content 不能为空' }, { status: 400 })
    }

    // 查找消息，验证属于同一租户
    const [msg] = await sql`
      SELECT m.id, m.sender_id, m.created_at, m.department_id, a.user_id as owner_user_id, a.tenant_id
      FROM messages m
      JOIN agents a ON a.id = m.sender_id
      WHERE m.id = ${params.id} AND a.tenant_id = ${tenantId}
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
    if (new Date(msg.created_at) < fiveMinutesAgo) {
      return Response.json({ error: '消息已超过 5 分钟，无法编辑' }, { status: 400 })
    }

    await sql`
      UPDATE messages SET content = ${body.content.trim()}
      WHERE id = ${params.id}
    `

    // WS 推送编辑事件
    wsHub.broadcast(msg.department_id, {
      type: 'message_edited',
      messageId: params.id,
      content: body.content.trim(),
    })

    return Response.json({ success: true })
  })

  // ── 删除消息（撤回） ───────────────────────────────────────

  app.delete('/api/messages/:id', async (req: Request, ctx: Context): Promise<Response> => {
    const { sql, tenantId, auth, params } = ctx

    const [msg] = await sql`
      SELECT m.id, m.sender_id, m.created_at, a.user_id as owner_user_id, m.department_id
      FROM messages m
      JOIN agents a ON a.id = m.sender_id
      WHERE m.id = ${params.id} AND a.tenant_id = ${tenantId}
    `
    if (!msg) {
      return Response.json({ error: '消息不存在' }, { status: 404 })
    }

    // 仅消息发送者可撤回
    if (msg.owner_user_id !== auth!.userId) {
      return Response.json({ error: '只能撤回自己的消息' }, { status: 403 })
    }

    // 5 分钟内可撤回
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000)
    if (new Date(msg.created_at) < fiveMinutesAgo) {
      return Response.json({ error: '消息已超过 5 分钟，无法撤回' }, { status: 400 })
    }

    await sql`DELETE FROM messages WHERE id = ${params.id}`

    // WS 推送删除事件
    wsHub.broadcast(msg.department_id, {
      type: 'message_deleted',
      messageId: params.id,
    })

    return Response.json({ success: true })
  })

  // ── 审批 AI 回复（Human-in-the-Loop） ────────────────────

  app.post('/api/messages/:id/approve', async (req: Request, ctx: Context): Promise<Response> => {
    const { sql, tenantId, params } = ctx
    const body = await req.json() as { approved: boolean; reason?: string }

    const [msg] = await sql`
      SELECT m.id, m.ai_draft, m.ai_approved
      FROM messages m
      JOIN agents a ON a.id = m.sender_id
      WHERE m.id = ${params.id} AND a.tenant_id = ${tenantId}
    `
    if (!msg) {
      return Response.json({ error: '消息不存在' }, { status: 404 })
    }

    if (msg.ai_approved !== null) {
      return Response.json({ error: '该消息已审批' }, { status: 400 })
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
}
