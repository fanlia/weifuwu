/**
 * messager — 消息系统中间件（对齐 userSystem 模式）
 *
 * 定位：应用必须的一等能力——持久化消息（会话/消息表）+ 实时投递（WS/Redis 跨进程）。
 * 使用：
 *   app.use(db)
 *   app.use(userSystem({ sql }))          // 可选依赖：sender_id 来自 ctx.user
 *   app.use(messager({ sql, redis }))     // redis 可选：多进程广播
 *   app.ws('/ws', msg.handler())          // 实时协议（P2）
 *
 * 数据模型：_weifuwu_conversations / _weifuwu_conversation_members / _weifuwu_messages
 * sender_type + sender_id（不 FK users）——user/agent/system 消息天然可存。
 */

import { HttpError, type Context, type Handler, type Middleware } from '../types.ts'
import type { Router } from '../core/router.ts'
import type { SqlClient } from '../postgres/types.ts'
import type { Redis } from '../db/contracts.ts'
import type { WebSocketHandler } from '../core/ws.ts'
import { ok, created, badRequest, noContent } from '../response.ts'

// ── 类型 ────────────────────────────────────────────────

export type MessageSenderType = 'user' | 'agent' | 'system'

export interface Message {
  id: string
  conversation_id: string
  sender_type: MessageSenderType
  sender_id: string | null
  content: string
  msg_type: string
  created_at: string
  edited_at?: string | null
  deleted_at?: string | null
}

export interface Conversation {
  id: string
  type: 'direct' | 'group'
  created_by: string | null
  created_at: string
  /** 最后一条未删除消息（列表场景） */
  last_message?: Message | null
  /** 当前用户未读消息数 */
  unread_count?: number
}

export interface SendMessageInput {
  senderType: MessageSenderType
  senderId: string | null
  content: string
  msgType?: string
}

export type CreateConversationInput =
  | { type: 'direct'; otherUserId: string }
  | { type: 'group'; memberIds: string[] }

/** 实时事件（业务事件对象，如 { type: 'new_message', ... }） */
export type MsgEvent = Record<string, unknown>

/** messager 实例序号（SELF_PID 唯一性：同进程多实例也能区分） */
let messagerSeq = 0

export interface MessagerClient {
  // ── 实时（P2） ──
  /** 标准 WS 协议 handler（connected/subscribe/unsubscribe/ping/pong），供 app.ws(path, ...) */
  handler: () => WebSocketHandler
  /** 房间广播（本地 + Redis 跨进程；room 约定 `conv:{id}` / `user:{id}`） */
  broadcast: (room: string, event: MsgEvent) => void
  /** 用户维度点对点（内部 room `user:{id}`） */
  sendTo: (userId: string, event: MsgEvent) => void
  join: (room: string, ws: import('ws').WebSocket) => void
  leave: (room: string, ws: import('ws').WebSocket) => void
  /** 关闭 Redis 订阅连接 */
  close: () => Promise<void>
  // ── 会话 ──
  createConversation(userId: string, input: CreateConversationInput): Promise<Conversation>
  /** 当前用户的会话列表（最后消息 + 未读数，按最近活动倒序） */
  listConversations(userId: string): Promise<Conversation[]>
  /** 成员视角取会话（非成员返回 null） */
  getConversationForUser(conversationId: string, userId: string): Promise<Conversation | null>
  isMember(conversationId: string, userId: string): Promise<boolean>
  // ── 消息 ──
  sendMessage(conversationId: string, input: SendMessageInput): Promise<Message>
  /** 历史游标分页（倒序；before = 上页最后一条消息 id，返回更早的） */
  listMessages(conversationId: string, opts: { before?: string; limit?: number }): Promise<Message[]>
  editMessage(messageId: string, content: string): Promise<Message | null>
  /** 软删（deleted_at 写入） */
  deleteMessage(messageId: string): Promise<boolean>
  markRead(conversationId: string, userId: string): Promise<void>
}

export interface MessagerInjected {
  msg: MessagerClient
}

export interface MessagerSystem extends Middleware<Context, Context & MessagerInjected> {
  /** 核心服务（测试/服务层直接调用；ctx.msg 同对象） */
  client: MessagerClient
  /** 幂等建表（conversations + members + messages） */
  migrate: () => Promise<void>
  /** HTTP 路由（P3）：/api/messages/* */
  routes: (app: Router<any>, opts?: { prefix?: string }) => void
}

export interface MessagerOptions {
  sql: SqlClient
  /** Redis（必传：多进程广播/实时推送）——Redis 接口：传 `redis().redis`（中间件）或 `new RedisPool()`/`RedisPool.create()` */
  redis: Redis
  prefix?: string
}

declare module '../types.ts' {
  interface Context {
    msg?: MessagerClient
  }
}

// ── 常量 ────────────────────────────────────────────────

const CONVERSATIONS = '_weifuwu_conversations'
const MEMBERS = '_weifuwu_conversation_members'
const MESSAGES = '_weifuwu_messages'

// ── 工厂 ────────────────────────────────────────────────

export function messager(options: MessagerOptions): MessagerSystem {
  const sql = options.sql
  const prefix = options.prefix ?? '/api/messages'

  // ── 会话 ──
  async function createConversation(userId: string, input: CreateConversationInput): Promise<Conversation> {
    if (input.type === 'direct') {
      // 同对用户唯一（顺序无关，恰好两名成员）
      const existing = await sql.unsafe(
        `SELECT c.id, c.type, c.created_by, c.created_at FROM ${CONVERSATIONS} c
         WHERE c.type = 'direct'
           AND EXISTS (SELECT 1 FROM ${MEMBERS} m WHERE m.conversation_id = c.id AND m.user_id = $1)
           AND EXISTS (SELECT 1 FROM ${MEMBERS} m WHERE m.conversation_id = c.id AND m.user_id = $2)
           AND (SELECT count(*) FROM ${MEMBERS} m WHERE m.conversation_id = c.id) = 2
         LIMIT 1`,
        [userId, input.otherUserId],
      )
      if (existing.length) return existing[0] as unknown as Conversation
      return createConversationRow(userId, 'direct', [userId, input.otherUserId])
    }
    const memberIds = [userId, ...input.memberIds.filter(m => m !== userId)]
    return createConversationRow(userId, 'group', memberIds)
  }

  async function createConversationRow(
    createdBy: string,
    type: 'direct' | 'group',
    memberIds: string[],
  ): Promise<Conversation> {
    // 事务：会话 + 成员
    await sql.unsafe(`BEGIN`)
    try {
      const rows = await sql.unsafe(
        `INSERT INTO ${CONVERSATIONS} (type, created_by) VALUES ($1, $2) RETURNING id, type, created_by, created_at`,
        [type, createdBy],
      )
      const conv = rows[0]
      for (const memberId of memberIds) {
        await sql.unsafe(
          `INSERT INTO ${MEMBERS} (conversation_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [conv.id, memberId],
        )
      }
      await sql.unsafe(`COMMIT`)
      return conv as unknown as Conversation
    } catch (err) {
      await sql.unsafe(`ROLLBACK`)
      throw err
    }
  }

  async function listConversations(userId: string): Promise<Conversation[]> {
    const rows = await sql.unsafe(
      `SELECT c.id, c.type, c.created_by, c.created_at,
         (SELECT to_jsonb(m) FROM ${MESSAGES} m
          WHERE m.conversation_id = c.id AND m.deleted_at IS NULL
          ORDER BY m.created_at DESC, m.id DESC LIMIT 1) AS last_message,
         (SELECT count(*) FROM ${MESSAGES} m
          WHERE m.conversation_id = c.id AND m.deleted_at IS NULL
            AND m.sender_id IS DISTINCT FROM $1
            AND m.created_at > COALESCE(mem.last_read_at, 'epoch'::timestamptz)) AS unread_count
       FROM ${CONVERSATIONS} c
       JOIN ${MEMBERS} mem ON mem.conversation_id = c.id
       WHERE mem.user_id = $1
       ORDER BY c.created_at DESC`,
      [userId],
    )
    return rows.map(r => {
      const conv = r as any
      const last = conv.last_message as unknown
      return {
        id: conv.id,
        type: conv.type,
        created_by: conv.created_by,
        created_at: new Date(conv.created_at as Date).toISOString(),
        last_message: last && typeof last === 'object' ? normalizeMessage(last) : null,
        unread_count: Number(conv.unread_count),
      }
    })
  }

  async function getConversationForUser(conversationId: string, userId: string): Promise<Conversation | null> {
    if (!(await isMember(conversationId, userId))) return null
    const rows = await sql.unsafe(
      `SELECT id, type, created_by, created_at FROM ${CONVERSATIONS} WHERE id = $1`,
      [conversationId],
    )
    return rows.length ? (rows[0] as unknown as Conversation) : null
  }

  async function isMember(conversationId: string, userId: string): Promise<boolean> {
    const rows = await sql.unsafe(
      `SELECT 1 FROM ${MEMBERS} WHERE conversation_id = $1 AND user_id = $2`,
      [conversationId, userId],
    )
    return rows.length > 0
  }

  // ── 消息 ──
  async function sendMessage(conversationId: string, input: SendMessageInput): Promise<Message> {
    const rows = await sql.unsafe(
      `INSERT INTO ${MESSAGES} (conversation_id, sender_type, sender_id, content, msg_type)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [conversationId, input.senderType, input.senderId ?? null, input.content, input.msgType ?? 'text'],
    )
    return normalizeMessage(rows[0])
  }

  async function listMessages(
    conversationId: string,
    opts: { before?: string; limit?: number },
  ): Promise<Message[]> {
    const limit = opts.limit ?? 50
    // 保留软删消息（deleted_at 标记，前端自行显示"已删除"占位或隐藏）
    const rows = await sql.unsafe(
      `SELECT * FROM ${MESSAGES}
       WHERE conversation_id = $1
         AND ($2::uuid IS NULL OR (created_at, id) < (SELECT created_at, id FROM ${MESSAGES} WHERE id = $2))
       ORDER BY created_at DESC, id DESC
       LIMIT $3`,
      [conversationId, opts.before ?? null, limit],
    )
    return rows.map(normalizeMessage)
  }

  async function editMessage(messageId: string, content: string): Promise<Message | null> {
    const rows = await sql.unsafe(
      `UPDATE ${MESSAGES} SET content = $2, edited_at = now()
       WHERE id = $1 AND deleted_at IS NULL RETURNING *`,
      [messageId, content],
    )
    return rows.length ? normalizeMessage(rows[0]) : null
  }

  async function deleteMessage(messageId: string): Promise<boolean> {
    const rows = await sql.unsafe(
      `UPDATE ${MESSAGES} SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL RETURNING id`,
      [messageId],
    )
    return rows.length > 0
  }

  async function markRead(conversationId: string, userId: string): Promise<void> {
    await sql.unsafe(
      `UPDATE ${MEMBERS} SET last_read_at = now() WHERE conversation_id = $1 AND user_id = $2`,
      [conversationId, userId],
    )
  }

  function normalizeMessage(row: any): Message {
    return {
      id: row.id,
      conversation_id: row.conversation_id,
      sender_type: row.sender_type,
      sender_id: row.sender_id,
      content: row.content,
      msg_type: row.msg_type,
      created_at: new Date(row.created_at as Date).toISOString(),
      edited_at: row.edited_at ? new Date(row.edited_at as Date).toISOString() : null,
      deleted_at: row.deleted_at ? new Date(row.deleted_at as Date).toISOString() : null,
    }
  }

  // ── 中间件（P1：仅注入；P2 挂 handler，P3 挂路由） ──
  // ── 实时：房间 + Redis 跨进程广播 ──
  const REDIS_PREFIX = 'wf:msg:'
  const rooms = new Map<string, Set<import('ws').WebSocket>>()
  const wsRooms = new Map<import('ws').WebSocket, Set<string>>()
  let redisSub: any = null

  function initRedis(): void {
    const pool = options.redis
    if (!pool || redisSub) return
    redisSub = pool.createSubscriber()
    redisSub.connect().then(() => {
      redisSub.psubscribe(`${REDIS_PREFIX}*`, (channel: string, message: string) => {
        // 跨进程消息 → 本地广播（不重发 Redis，避免环）
        const room = channel.slice(REDIS_PREFIX.length)
        const event = JSON.parse(message) as MsgEvent & { _pid?: string }
        // 本进程 publish 的环回消息跳过（已本地直发过）——否则每个事件发两次，客户端乱序/重复
        if (event._pid === SELF_PID) return
        broadcastLocal(room, event)
      })
    }).catch((err: unknown) => {
      console.error('[messager] redis subscriber init error:', err)
    })
  }

  // 实例唯一标识：Redis 环回去重（broadcast 本地直发 + Redis publish，
  // 本实例的 subscriber 会收到自己 publish 的消息 → 重复广播 → 客户端 token 重复/乱序）。
  // 用 进程pid+实例序号 而非纯 pid：同进程多实例（测试/微服务）也能正确区分。
  const SELF_PID = `wf:${process.pid}:${++messagerSeq}`

  function broadcastLocal(room: string, event: MsgEvent): void {
    const members = rooms.get(room)
    if (!members) return
    // 剥离内部 _pid 元数据（不发给客户端）
    const { _pid, ...clean } = event
    const payload = JSON.stringify(clean)
    for (const ws of [...members]) {
      if (ws.readyState === ws.OPEN) {
        try { ws.send(payload) } catch { /* 断线忽略 */ }
      }
    }
  }

  function broadcast(room: string, event: MsgEvent): void {
    broadcastLocal(room, event)
    const pool = options.redis
    if (pool) {
      // 携带发布者 PID——订阅方据此跳过自己发的消息（防止单进程环回重复）
      pool.publish(`${REDIS_PREFIX}${room}`, JSON.stringify({ ...event, _pid: SELF_PID })).catch((err: unknown) => {
        console.error('[messager] redis publish error:', err)
      })
    }
  }

  function sendTo(userId: string, event: MsgEvent): void {
    broadcast(`user:${userId}`, event)
  }

  function join(room: string, ws: import('ws').WebSocket): void {
    let members = rooms.get(room)
    if (!members) { members = new Set(); rooms.set(room, members) }
    members.add(ws)
    let joined = wsRooms.get(ws)
    if (!joined) { joined = new Set(); wsRooms.set(ws, joined) }
    joined.add(room)
  }

  function leave(room: string, ws: import('ws').WebSocket): void {
    rooms.get(room)?.delete(ws)
    if (rooms.get(room)?.size === 0) rooms.delete(room)
    wsRooms.get(ws)?.delete(room)
  }

  function leaveAll(ws: import('ws').WebSocket): void {
    const joined = wsRooms.get(ws)
    if (joined) for (const room of [...joined]) leave(room, ws)
    wsRooms.delete(ws)
  }

  /** 标准协议：connected / subscribe→subscribed / unsubscribe / ping→pong */
  function handler(): WebSocketHandler {
    return {
      open(ws) {
        ws.send(JSON.stringify({ type: 'connected' }))
      },
      message(ws, _ctx, data) {
        try {
          const msg = JSON.parse(data.toString()) as { type?: string; room?: string }
          if (msg.type === 'ping') {
            ws.send(JSON.stringify({ type: 'pong' }))
          } else if (msg.type === 'subscribe' && msg.room) {
            join(msg.room, ws)
            ws.send(JSON.stringify({ type: 'subscribed', room: msg.room }))
          } else if (msg.type === 'unsubscribe' && msg.room) {
            leave(msg.room, ws)
          }
        } catch { /* 忽略畸形消息 */ }
      },
      close(ws) {
        leaveAll(ws)
      },
      error(ws) {
        leaveAll(ws)
      },
    }
  }

  async function close(): Promise<void> {
    if (redisSub) {
      try { await redisSub.close?.() } catch { /* ignore */ }
      redisSub = null
    }
    rooms.clear()
    wsRooms.clear()
  }

  const client: MessagerClient = {
    handler,
    broadcast,
    sendTo,
    join,
    leave,
    close,
    createConversation,
    listConversations,
    getConversationForUser,
    isMember,
    sendMessage,
    listMessages,
    editMessage,
    deleteMessage,
    markRead,
  }

  // Redis 订阅连接在工厂构造时初始化——实时层（handler/broadcast）是全局的，
  // WS 升级路径不经过请求中间件，不能依赖请求时才建连
  initRedis()

  const mw = (async (req: Request, ctx: Context, next: Handler) => {
    ctx.msg = client
    return next(req, ctx)
  }) as unknown as MessagerSystem

  mw.client = client
  mw.__meta = { injects: ['msg'], depends: ['sql'] }

  // ── 幂等建表 ──
  mw.migrate = async () => {
    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS ${CONVERSATIONS} (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        type TEXT NOT NULL DEFAULT 'direct',
        created_by UUID,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `)
    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS ${MEMBERS} (
        conversation_id UUID NOT NULL REFERENCES ${CONVERSATIONS}(id) ON DELETE CASCADE,
        user_id UUID NOT NULL,
        last_read_at TIMESTAMPTZ,
        joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (conversation_id, user_id)
      )
    `)
    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS ${MESSAGES} (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        conversation_id UUID NOT NULL REFERENCES ${CONVERSATIONS}(id) ON DELETE CASCADE,
        sender_type TEXT NOT NULL DEFAULT 'user',
        sender_id UUID,
        content TEXT NOT NULL,
        msg_type TEXT NOT NULL DEFAULT 'text',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        edited_at TIMESTAMPTZ,
        deleted_at TIMESTAMPTZ
      )
    `)
    await sql.unsafe(`
      CREATE INDEX IF NOT EXISTS idx_messages_conv ON ${MESSAGES} (conversation_id, created_at DESC, id DESC)
    `)
  }

  // ── 路由（P3：HTTP API，鉴权依赖 userSystem） ──
  mw.routes = (app: Router<any>, routeOpts?: { prefix?: string }) => {
    const p = routeOpts?.prefix ?? prefix

    /** 会话成员校验：非成员抛 403 */
    async function requireMember(conversationId: string, ctx: Context): Promise<void> {
      if (!ctx.user) throw new HttpError('Unauthorized', 401)
      if (!(await isMember(conversationId, ctx.user.id))) {
        throw new HttpError('Forbidden: not a conversation member', 403)
      }
    }

    // 创建会话
    app.post(`${p}/conversations`, async (req, ctx) => {
      if (!ctx.user) throw new HttpError('Unauthorized', 401)
      const body = (await req.json().catch(() => ({}))) as CreateConversationInput
      if (body.type === 'direct' && body.otherUserId) {
        const conv = await createConversation(ctx.user.id, { type: 'direct', otherUserId: body.otherUserId })
        return created(conv)
      }
      if (body.type === 'group' && Array.isArray(body.memberIds)) {
        const conv = await createConversation(ctx.user.id, { type: 'group', memberIds: body.memberIds })
        return created(conv)
      }
      return badRequest('conversation input invalid')
    })

    // 我的会话列表
    app.get(`${p}/conversations`, async (_req, ctx) => {
      if (!ctx.user) throw new HttpError('Unauthorized', 401)
      return ok(await listConversations(ctx.user.id))
    })

    // 历史消息（游标分页）
    app.get(`${p}/conversations/:id/messages`, async (req, ctx) => {
      if (!ctx.user) throw new HttpError('Unauthorized', 401)
      const convId = ctx.params.id as string
      await requireMember(convId, ctx)
      const url = new URL(req.url)
      const before = url.searchParams.get('before') ?? undefined
      const limit = Number(url.searchParams.get('limit') ?? 50)
      return ok(await listMessages(convId, { before, limit }))
    })

    // 发消息（持久化 + 实时广播 new_message）
    app.post(`${p}/conversations/:id/messages`, async (req, ctx) => {
      if (!ctx.user) throw new HttpError('Unauthorized', 401)
      const convId = ctx.params.id as string
      await requireMember(convId, ctx)
      const body = (await req.json().catch(() => ({}))) as { content?: string; msgType?: string }
      if (!body.content?.trim()) return badRequest('content is required')
      const message = await sendMessage(convId, {
        senderType: 'user',
        senderId: ctx.user.id,
        content: body.content,
        msgType: body.msgType ?? 'text',
      })
      broadcast(`conv:${convId}`, { type: 'new_message', message })
      return created(message)
    })

    // 已读
    app.post(`${p}/conversations/:id/read`, async (_req, ctx) => {
      if (!ctx.user) throw new HttpError('Unauthorized', 401)
      const convId = ctx.params.id as string
      await requireMember(convId, ctx)
      await markRead(convId, ctx.user.id)
      return noContent()
    })

    // 编辑消息（广播 message_edited）
    app.patch(`${p}/messages/:id`, async (req, ctx) => {
      if (!ctx.user) throw new HttpError('Unauthorized', 401)
      const messageId = ctx.params.id as string
      const body = (await req.json().catch(() => ({}))) as { content?: string }
      if (!body.content?.trim()) return badRequest('content is required')
      const edited = await editMessage(messageId, body.content)
      if (!edited) return badRequest('message not found')
      // 只能编辑自己的消息
      if (edited.sender_type === 'user' && edited.sender_id !== ctx.user.id) {
        throw new HttpError('Forbidden: not your message', 403)
      }
      broadcast(`conv:${edited.conversation_id}`, { type: 'message_edited', message: edited })
      return ok(edited)
    })

    // 删除消息（软删 + 广播 message_deleted）
    app.delete(`${p}/messages/:id`, async (req, ctx) => {
      if (!ctx.user) throw new HttpError('Unauthorized', 401)
      const messageId = ctx.params.id as string
      const list = await sql.unsafe(
        `SELECT conversation_id, sender_type, sender_id FROM ${MESSAGES} WHERE id = $1`,
        [messageId],
      )
      if (!list.length) return badRequest('message not found')
      const row = list[0] as any
      if (row.sender_type === 'user' && row.sender_id !== ctx.user.id) {
        throw new HttpError('Forbidden: not your message', 403)
      }
      await requireMember(row.conversation_id, ctx)
      await deleteMessage(messageId)
      broadcast(`conv:${row.conversation_id}`, { type: 'message_deleted', messageId })
      return noContent()
    })
  }

  return mw
}
