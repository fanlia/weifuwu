/**
 * 消息路由 — 发送/获取消息
 */

import type { Router, Context } from 'weifuwu'
import type { AppCtx } from '../middleware/ctx.ts'
import { handleNewMessage, handleNewMessageStream, handleNewMessageStreamSSE } from '../services/chat.ts'
import { ops, and, eq, inArray } from 'weifuwu'
import { tables } from '../db/orm.ts'

export function registerMessageRoutes(app: Router<AppCtx>): void {
  // ── 审批待办（租户内全部待批草稿，供管理员集中处理） ──────────

  app.get('/api/messages/pending-approvals', async (req: Request, ctx: AppCtx): Promise<Response> => {
    const { orm, appId } = ctx
    const pending = await orm.query.from('messages m')
      .join('agents a', { 'a.id': { col: 'm.sender_id' } })
      .join('departments d', { 'd.id': { col: 'm.department_id' } })
      .select('m.id', 'm.department_id', 'm.content', 'm.ai_draft', 'm.created_at',
        'a.name as agent_name', 'a.type as agent_type',
        'd.name as department_name')
      .where(and({ 'a.app_id': { eq: String(appId) } }, { 'm.ai_draft': { ne: null } }, { 'm.ai_approved': { isNull: true } }))
      .orderBy('m.created_at', 'desc')
      .limit(50)
      .run()
    return Response.json({ pending })
  })

  // CHAT-INTERACTION 延伸：批量审批（积压部门 66 条待审实证——逐条 66 次点击）。
  // 仅批量批准（批量拒绝判负：拒绝清 ai_draft 不可逆——误拒无挽回，留逐条慎重）。
  // 逐条复用单条语义：app 隔离 + 已审跳过 + 部门 admin 权限（跨部门批量部分成功）
  app.post('/api/messages/pending-approvals/bulk', async (req: Request, ctx: AppCtx): Promise<Response> => {
    const { orm, appId, auth } = ctx
    const body = await req.json() as { ids?: string[] }
    const ids = [...new Set((body.ids ?? []).map(String))].slice(0, 50)
    if (ids.length === 0) {
      return Response.json({ error: 'ids 为必填（≤50 条）' }, { status: 400 })
    }
    // 一次查全部目标（app 隔离 + 待审状态）——避免逐条查库
    const rows = await orm.query.from('messages m')
      .join('agents a', { 'a.id': { col: 'm.sender_id' } })
      .select('m.id', 'm.department_id')
      .where(and({ 'a.app_id': { eq: String(appId) } }, { 'm.ai_draft': { ne: null } }, { 'm.ai_approved': { isNull: true } }, { 'm.id': { in: ids } }))
      .run()
    const byId = new Map(rows.map((r: any) => [String(r.id), r]))
    // 当前用户的部门 admin 集合（一次查——跨部门批量逐条判定）
    const adminDepts = new Set((await orm.query.from('department_members dm')
      .join('agents ua', { 'ua.id': { col: 'dm.agent_id' } })
      .select('dm.department_id')
      .where(and({ 'ua.user_id': { eq: String(auth!.userId) } }, { 'ua.app_id': { eq: String(appId) } }, { 'dm.role': { eq: 'admin' } }))
      .run()).map((r: any) => String(r.department_id)))
    // [owner/tenant-admin 租户级放行——单条语义同源（departments.ts L447 三方放行）]
    const [tenantRole] = await orm.query.from('_weifuwu_app_members')
      .select('role')
      .where(and({ app_id: { eq: String(appId) } }, { user_id: { eq: String(auth!.userId) } }))
      .run()
    const isTenantOwner = tenantRole?.role === 'owner'
    let approvedCount = 0
    const skipped: string[] = []
    const failed: Array<{ id: string; error: string }> = []
    for (const id of ids) {
      const msg = byId.get(id)
      if (!msg) { failed.push({ id, error: '不存在或已审批' }); continue }
      if (!isTenantOwner && !adminDepts.has(String(msg.department_id))) {
        failed.push({ id, error: '只有部门管理员可以审批' }); continue
      }
      const T = tables(ctx.orm)
      await (T.messages.update({ content: ops.colRef('ai_draft'), ai_approved: true }).where(eq(T.messages.c.id, id))).run()
      approvedCount++
    }
    void skipped
    return Response.json({ ok: true, approved: approvedCount, failed })
  })

  // ── 获取消息列表 ─────────────────────────────────────────

  app.get('/api/departments/:id/messages', async (req: Request, ctx: AppCtx): Promise<Response> => {
    const { orm, appId, params } = ctx
    const url = new URL(req.url)
    const limit = parseInt(url.searchParams.get('limit') ?? '50', 10)
    const before = url.searchParams.get('before') // cursor 分页
    const q = url.searchParams.get('q')?.trim() ?? '' // 消息搜索

    // 验证部门存在
    const [dept] = await orm.query.from('departments d')
      .select('d.id')
      .where(and({ 'd.id': { eq: params.id }}, { 'd.app_id': { eq: String(appId) } }))
      .run()
    if (!dept) {
      return Response.json({ error: '部门不存在' }, { status: 404 })
    }

    // cursor 分页：先查锚点 created_at（两查询同语义——子查询拆解，无 SQL 逃生舱）
    // ISO 字符串单源（行值/参数一律 ISO——memory 与真库行值形态一致——Date 直传会破坏 memory 比较）
    let beforeAt: string | null = null
    if (before) {
      const [anchor] = await orm.query.from('messages').select('created_at').where({ id: { eq: before }}).run()
      beforeAt = anchor ? String((anchor as any).created_at) : new Date().toISOString()
    }
    const messages = await orm.query.from('messages m')
      .join('agents a', { 'a.id': { col: 'm.sender_id' } }, { type: 'left' })
      .join('messages r', { 'r.id': { col: 'm.reply_to' } }, { type: 'left' })
      .join('agents ra', { 'ra.id': { col: 'r.sender_id' } }, { type: 'left' })
      .select(
        'm.id', 'm.department_id', 'm.sender_id', 'm.content', 'm.msg_type',
        'm.ai_draft', 'm.ai_approved', 'm.created_at', 'm.reply_to', 'm.attachments',
        'm.routed_to', 'm.ai_step', 'm.quick_replies',
        'a.name as sender_name', 'a.type as sender_type', 'a.avatar_url as sender_avatar',
        'r.content as reply_content', 'ra.name as reply_sender')
      .where(and({ 'm.department_id': { eq: params.id }}, (beforeAt ? { 'm.created_at': { lt: beforeAt } } : {}), (q ? { 'm.content': { ilike: '%' + q + '%' } } : {})))
      .orderBy('m.created_at', 'desc')
      .limit(limit)
      .run()

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
    const { orm, appId, auth, params } = ctx
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
    const T = tables(orm)
    let [sender] = await T.agents
      .select('id', 'name')
      .where(and(eq(T.agents.c.app_id, appId), eq(T.agents.c.type, 'user'), eq(T.agents.c.user_id, auth!.userId)))
      .run()
    if (!sender) {
      // 自愈：老用户缺少绑定 agent 时自动创建
      const [u] = await orm.query.from('_weifuwu_users').select('name').where({ id: { eq: String(auth!.userId) } }).run()
      ;[sender] = await T.agents
        .insert({ app_id: String(appId), type: 'user', name: u ? String((u as any).name ?? '用户') : '用户', user_id: String(auth!.userId), is_active: true })
        .returning('id')
        .run()
    }

    // 验证部门存在且用户是成员
    const memberships = await orm.query.from('department_members dm')
      .join('departments d', { 'd.id': { col: 'dm.department_id' } })
      .select('dm.department_id')
      .where(and({ 'd.app_id': { eq: String(appId) } }, { 'dm.department_id': { eq: params.id }}, { 'dm.agent_id': { eq: String(sender.id) } }))
      .limit(1)
      .run()
    if (memberships.length === 0) {
      return Response.json({ error: '你不是该部门的成员' }, { status: 403 })
    }

    // P1-3 附件：校验（白名单/大小/消毒）→ 落盘附件区 data/uploads/{app_id}/{dept}/{msg_id}/
    let attachmentMeta: Array<{ name: string; path: string; size: number; ext: string }> | null = null
    if (body.attachments && body.attachments.length > 0) {
      const { validateUploadFile } = await import('../services/upload.ts')
      const fs = await import('node:fs/promises')
      const pathMod = await import('node:path')
      const [message] = (await T.messages
        .insert({ department_id: params.id, sender_id: String(sender.id), content, msg_type: body.msg_type ?? 'text', reply_to: body.reply_to ?? null })
        .returning('id')
        .run()) as unknown as Array<Record<string, any>>
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
      await T.messages.update({ attachments: attachmentMeta }).where(eq(T.messages.c.id, message.id)).run()
      ;(message as any).content = content
      ;(message as any).msg_type = body.msg_type ?? 'text'
      ;(message as any).created_at = new Date().toISOString()
      // WS 推送 + 异步回复继续走下方公共代码
      ctx.msg.broadcast(String(params.id), {
        type: 'new_message',
        departmentId: params.id,
        message: { id: message.id, sender_id: message.sender_id, sender_name: (sender as any).name ?? '', content: message.content, attachments: attachmentMeta },
      })
      handleNewMessageStream(ctx, params.id, String(sender.id), content, String(message.id), requestId).catch((err) =>
        console.error('[messages] handleNewMessageStream error:', err),
      )
      return Response.json({ message }, { status: 201 })
    }

    const [message] = (await T.messages
      .insert({ department_id: params.id, sender_id: String(sender.id), content, msg_type: body.msg_type ?? 'text', reply_to: body.reply_to ?? null })
      .returning('id', 'department_id', 'sender_id', 'content', 'msg_type', 'created_at')
      .run()) as unknown as Array<Record<string, any>>

    // WebSocket 推送新消息
    ctx.msg.broadcast(String(params.id), {
      type: 'new_message',
      departmentId: params.id,
      message: { id: message.id, sender_id: message.sender_id, sender_name: (sender as any).name ?? '', content: message.content },
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
    const { orm, appId, auth, params } = ctx
    const body = await req.json() as { content: string }

    if (!body.content) {
      return Response.json({ error: 'content 为必填' }, { status: 400 })
    }

    // 消息长度上限（后端强制——防无界入库 + AI 上下文浪费）
    const content = String(body.content).slice(0, 5000)

    // 验证发件人 agent
    const T = tables(orm)
    let [sender] = await T.agents
      .select('id', 'name')
      .where(and(eq(T.agents.c.app_id, appId), eq(T.agents.c.type, 'user'), eq(T.agents.c.user_id, auth!.userId)))
      .run()
    if (!sender) {
      const [u] = await orm.query.from('_weifuwu_users').select('name').where({ id: { eq: String(auth!.userId) } }).run()
      ;[sender] = await T.agents
        .insert({ app_id: String(appId), type: 'user', name: u ? String((u as any).name ?? '用户') : '用户', user_id: String(auth!.userId), is_active: true })
        .returning('id')
        .run()
    }

    // 验证成员资格
    const memberships = await orm.query.from('department_members dm')
      .join('departments d', { 'd.id': { col: 'dm.department_id' } })
      .select('dm.department_id')
      .where(and({ 'd.app_id': { eq: String(appId) } }, { 'dm.department_id': { eq: params.id }}, { 'dm.agent_id': { eq: String(sender.id) } }))
      .limit(1)
      .run()
    if (memberships.length === 0) {
      return Response.json({ error: '你不是该部门的成员' }, { status: 403 })
    }

    // 创建消息
    const [message] = await T.messages
      .insert({ department_id: params.id, sender_id: String(sender.id), content: body.content, msg_type: 'text' })
      .returning('id', 'department_id', 'sender_id', 'content', 'msg_type', 'created_at')
      .run()

    // WS 推送新消息（让其他 WS 客户端也能看到）
    ctx.msg.broadcast(String(params.id), {
      type: 'new_message',
      departmentId: params.id,
      message: { id: message.id, sender_id: message.sender_id, sender_name: (sender as any).name ?? '', content: message.content },
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
    const { orm, appId, auth, params } = ctx
    const body = await req.json() as { content: string }

    if (!body.content?.trim()) {
      return Response.json({ error: 'content 不能为空' }, { status: 400 })
    }

    // 查找消息，验证属于同一租户
    const [msg] = await orm.query.from('messages m')
      .join('agents a', { 'a.id': { col: 'm.sender_id' } })
      .select('m.id', 'm.sender_id', 'm.created_at', 'm.department_id', 'a.user_id as owner_user_id', 'a.app_id')
      .where(and({ 'm.id': { eq: params.id }}, { 'a.app_id': { eq: String(appId) } }))
      .run()
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

    const T = tables(orm)
    await T.messages.update({ content: body.content.trim() }).where(eq(T.messages.c.id, params.id)).run()

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
    const { orm, appId, auth, params } = ctx

    const [msg] = await orm.query.from('messages m')
      .join('agents a', { 'a.id': { col: 'm.sender_id' } })
      .select('m.id', 'm.sender_id', 'm.created_at', 'a.user_id as owner_user_id', 'm.department_id')
      .where(and({ 'm.id': { eq: params.id }}, { 'a.app_id': { eq: String(appId) } }))
      .run()
    if (!msg) {
      return Response.json({ error: '消息不存在' }, { status: 404 })
    }

    // 权限：发送者可撤回（5 分钟）；owner 可删除任意消息（不限时）。
    // （ROLES-OPTIMIZATION 波次 1：app 级 admin 幽灵角色裁剪——invite 只产
    // member/viewer、DB 零实例——分支诚实化；行为不变）
    const isOwner = msg.owner_user_id === auth!.userId
    const isAdmin = auth!.role === 'owner'
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

    const T = tables(orm)
    await T.messages.delete().where(eq(T.messages.c.id, params.id)).run()

    // WS 推送删除事件
    ctx.msg.broadcast(String(String(msg.department_id)), {
      type: 'message_deleted',
      messageId: params.id,
    })

    return Response.json({ success: true })
  })

  // ── 消息反馈（R6 质量闭环：AI 回复点赞/点踩） ─────────────

  app.post('/api/messages/:id/feedback', async (req: Request, ctx: AppCtx): Promise<Response> => {
    const { orm, appId, params } = ctx
    const body = await req.json() as { feedback?: string }
    const fb = body.feedback === 'like' || body.feedback === 'dislike' ? body.feedback
      : body.feedback === null || body.feedback === '' ? null
      : undefined
    if (fb === undefined) {
      return Response.json({ error: 'feedback 必须是 like/dislike/null' }, { status: 400 })
    }
    // 校验消息属于租户且是 AI 回复
    const [msg] = await orm.query.from('messages m')
      .join('agents a', { 'a.id': { col: 'm.sender_id' } })
      .select('m.id')
      .where(and({ 'm.id': { eq: params.id }}, { 'a.app_id': { eq: String(appId) } }, { 'a.type': { eq: 'ai' } }))
      .run()
    if (!msg) {
      return Response.json({ error: '消息不存在' }, { status: 404 })
    }
    const T = tables(orm)
    await T.messages.update({ feedback: fb }).where(eq(T.messages.c.id, params.id)).run()
    return Response.json({ success: true, feedback: fb })
  })

  // ── 草稿编辑（R6 质量闭环：审批人可修改 AI 草稿后批准） ───

  app.put('/api/messages/:id/draft', async (req: Request, ctx: AppCtx): Promise<Response> => {
    const { orm, appId, params, auth } = ctx
    const body = await req.json() as { draft?: string }
    const draft = String(body.draft ?? '').trim()
    if (!draft) {
      return Response.json({ error: '草稿不能为空' }, { status: 400 })
    }
    // 校验消息归属租户 + 待审批
    const [msg] = await orm.query.from('messages m')
      .join('agents a', { 'a.id': { col: 'm.sender_id' } })
      .select('m.id', 'm.department_id', 'm.ai_draft')
      .where(and({ 'm.id': { eq: params.id }}, { 'a.app_id': { eq: String(appId) } }, { 'm.ai_approved': { isNull: true } }))
      .run()
    if (!msg) {
      return Response.json({ error: '草稿不存在或已处理' }, { status: 404 })
    }
    // 权限：部门管理员（同审批）
    const [caller] = await orm.query.from('department_members dm')
      .join('agents ua', { 'ua.id': { col: 'dm.agent_id' } })
      .select('dm.role')
      .where(and({ 'dm.department_id': { eq: String(msg.department_id) } }, { 'ua.user_id': { eq: String(auth!.userId) } }))
      .limit(1)
      .run()
    const [callerOwner] = await orm.query.from('_weifuwu_app_members')
      .select('role')
      .where(and({ app_id: { eq: String(appId) } }, { user_id: { eq: String(auth!.userId) } }))
      .run()
    // 部门级 admin（department_members.role——合法角色 710 实例——勿与租户级幽灵 admin 裁剪混淆——ROLES-OPTIMIZATION 波次 1）
    if ((!caller || caller.role !== 'admin') && callerOwner?.role !== 'owner') {
      return Response.json({ error: '只有部门管理员可以编辑草稿' }, { status: 403 })
    }
    const T = tables(orm)
    await T.messages.update({ ai_draft: draft }).where(eq(T.messages.c.id, params.id)).run()
    try {
      const { writeAudit } = await import('../services/audit.ts')
      await writeAudit(ctx as any, { action: 'approval_draft_edit', target_type: 'message', target_id: String(params.id), detail: {} })
    } catch { /* 尽力 */ }
    return Response.json({ success: true })
  })

  // ── 审批 AI 回复（Human-in-the-Loop） ────────────────────

  app.post('/api/messages/:id/approve', async (req: Request, ctx: AppCtx): Promise<Response> => {
    const { orm, appId, params, auth } = ctx
    const body = await req.json() as { approved: boolean; reason?: string }

    const [msg] = await orm.query.from('messages m')
      .join('agents a', { 'a.id': { col: 'm.sender_id' } })
      .select('m.id', 'm.ai_draft', 'm.ai_approved', 'm.department_id')
      .where(and({ 'm.id': { eq: params.id }}, { 'a.app_id': { eq: String(appId) } }))
      .run()
    if (!msg) {
      return Response.json({ error: '消息不存在' }, { status: 404 })
    }

    if (msg.ai_approved !== null) {
      return Response.json({ error: '该消息已审批' }, { status: 400 })
    }

    // 审批权限：仅部门管理员可批（部门内 role='admin' 的成员）
    const [approver] = await orm.query.from('department_members dm')
      .join('agents ua', { 'ua.id': { col: 'dm.agent_id' } })
      .select('dm.role')
      .where(and({ 'dm.department_id': { eq: String(msg.department_id) } }, { 'ua.user_id': { eq: String(auth!.userId) } }))
      .limit(1)
      .run()
    // 部门级 admin（department_members.role——合法——勿与租户级幽灵 admin 裁剪混淆——ROLES-OPTIMIZATION 波次 1）
    if (!approver || approver.role !== 'admin') {
      return Response.json({ error: '只有部门管理员可以审批' }, { status: 403 })
    }

    const T = tables(orm)
    if (body.approved) {
      // 批准 — 将草稿发布为正式消息
      await (T.messages.update({ content: ops.colRef('ai_draft'), ai_approved: true })
        .where(eq(T.messages.c.id, params.id))).run()
    } else {
      // 拒绝
      await T.messages.update({ ai_approved: false, ai_draft: null }).where(eq(T.messages.c.id, params.id)).run()
    }

    return Response.json({ success: true, approved: body.approved })
  })

  // ── C1 断点续跑：从上次执行断点继续 ───────────────────────
  app.post('/api/messages/:id/continue', async (req: Request, ctx: AppCtx): Promise<Response> => {
    const { orm, appId, params } = ctx
    const [msg] = await orm.query.from('messages m')
      .join('agents a', { 'a.id': { col: 'm.sender_id' } })
      .select('m.id', 'm.department_id', 'm.content')
      .where(and({ 'm.id': { eq: params.id }}, { 'a.app_id': { eq: String(appId) } }, { 'a.type': { eq: 'user' } }))
      .run()
    if (!msg) return Response.json({ error: '消息不存在' }, { status: 404 })

    // 查上次执行状态（步骤清单——断点）
    const T = tables(orm)
    const [state] = await T.agent_run_states
      .select('steps', 'status')
      .where(eq(T.agent_run_states.c.message_id, params.id))
      .run()
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
