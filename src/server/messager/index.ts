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
import type { Orm } from '../db/orm.ts'
import { z } from '../../shared/zod.ts'
import { f } from '../db/shape.ts'
import type { Redis } from '../db/contracts.ts'
import type { Row } from '../db/postgres/connection.ts'
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

/** handler 可选鉴权注入（M15——2027-XX） */
export interface MessagerHandlerOptions {
  /** WS 握手 token 验证（query ?token=）——返回 { sub } 或 null（null = 拒绝） */
  verifyToken?: (token: string) => Promise<{ sub: string } | null>
  /** 订阅授权（已验证 userId + room）——false 拒绝订阅（发 error 事件）；不传 = 全允许 */
  authorizeRoom?: (userId: string, room: string) => boolean | Promise<boolean>
}

/** messager 实例序号（SELF_PID 唯一性：同进程多实例也能区分） */
let messagerSeq = 0

export interface MessagerClient {
  // ── 实时（P2） ──
  /** 标准 WS 协议 handler（connected/subscribe/unsubscribe/ping/pong），供 app.ws(path, ...)
   *  opts.verifyToken/authorizeRoom 注入鉴权（M15——原升级不跑中间件——任意客户端可订阅任意房间） */
  handler: (opts?: MessagerHandlerOptions) => WebSocketHandler
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
  /** HTTP 路由（P3）：/api/messages/* */
  routes: (app: Router<any>, opts?: { prefix?: string }) => void
}

export interface MessagerOptions {
  /** 声明式 ORM（postgres() 中间件的 .orm——表绑定/校验/事务） */
  orm: Orm
  /** Redis（可选：多进程广播/实时推送需要；不传则仅本进程内广播）——
   * 传 `redis().redis`（中间件）或 `new RedisPool()`/`RedisPool.create()` */
  redis?: Redis
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

// 表 shape（字段名=列名（snake——公共接口契约对齐）；orm.table 包装→校验/类型/归一
// 注：字段名蛇形是有意为之——Message/Conversation 公共接口（平台消费）即 snake
// 形态；camel 化留待接口演进（不破契约）
export const MESSAGER_TABLES = {
  conversations: {
    id: f.pk(z.uuid()),
    type: z.string().meta({ notNull: true, default: 'direct' }),
    created_by: z.uuid().nullable(),
    direct_key: z.string().nullable(),
    created_at: f.now(z.date()),
  },
  members: {
    conversation_id: f.req(z.uuid()),
    user_id: f.req(z.uuid()),
    last_read_at: z.date().nullable(),
    joined_at: f.now(z.date()),
  },
  messages: {
    id: f.pk(z.uuid()),
    conversation_id: f.req(z.uuid()),
    sender_type: z.string().meta({ notNull: true, default: 'user' }),
    sender_id: z.uuid().nullable(),
    content: f.req(z.string()),
    msg_type: z.string().meta({ notNull: true, default: 'text' }),
    created_at: f.now(z.date()),
    edited_at: z.date().nullable(),
    deleted_at: z.date().nullable(),
  },
} as const

// ── 工厂 ────────────────────────────────────────────────

export function messager(options: MessagerOptions): MessagerSystem {
  const orm = options.orm
  // 表绑定（工厂级——非事务面；事务内用 tx.table 重建（连接亲和）
  const C = orm.table(CONVERSATIONS, MESSAGER_TABLES.conversations)
  const MB = orm.table(MEMBERS, MESSAGER_TABLES.members)
  const MSG = orm.table(MESSAGES, MESSAGER_TABLES.messages)
  const prefix = options.prefix ?? '/api/messages'

  // ── 会话 ──
  async function findDirectConversation(userId: string, otherUserId: string): Promise<Conversation | null> {
    // 同对用户唯一（顺序无关，恰好两名成员）——Query Language（真库编译/内存直执行）
    const existing = await orm.query.from(`${CONVERSATIONS} c`)
      .where({ 'c.type': { eq: 'direct' } })
      .exists({ kind: 'select', table: MEMBERS, alias: 'm', cols: ['1'], where: { 'm.conversation_id': { col: 'c.id' }, 'm.user_id': { eq: userId } } })
      .exists({ kind: 'select', table: MEMBERS, alias: 'm', cols: ['1'], where: { 'm.conversation_id': { col: 'c.id' }, 'm.user_id': { eq: otherUserId } } })
      .in('c.id', { kind: 'select', table: MEMBERS, alias: 'm', cols: ['conversation_id'], groupBy: ['conversation_id'], having: { 'count(*)': { eq: 2 } } })
      .select('c.id', 'c.type', 'c.created_by', 'c.created_at')
      .limit(1)
      .run()
    return existing.length ? (existing[0] as unknown as Conversation) : null
  }

  /** 成员写入（幂等——PK 冲突 DO NOTHING；exec = 事务 orm 或裸 orm——连接亲和） */
  async function insertMembers(exec: Orm, conversationId: string, memberIds: string[]): Promise<void> {
    const MBtx = exec.table(MEMBERS)
    for (const memberId of memberIds) {
      await MBtx.insert({ conversation_id: conversationId, user_id: memberId })
        .onConflict(undefined, false) // 无目标列：任意唯一冲突跳过（联合约束 (conversation_id, user_id)）
        .run()
    }
  }

  async function createConversation(userId: string, input: CreateConversationInput): Promise<Conversation> {
    if (input.type === 'direct') {
      const directKey = [userId, input.otherUserId].sort().join(':')
      const existing = await findDirectConversation(userId, input.otherUserId)
      if (existing) return existing
      // M9（2027-XX）：并发查-插窗口根治——unique(direct_key) + onConflict DO NOTHING
      // → 输家重查赢家（零窗口；原实现并发同对用户双会话——实证）
      const run = async (tx: Orm): Promise<Conversation | null> => {
        const Ctx = tx.table(CONVERSATIONS)
        const rows = await Ctx.insert({ type: 'direct', created_by: userId, direct_key: directKey })
          .onConflict('direct_key')
          .run()
        if (!rows.length) return null // 并发输家
        const conv = rows[0]
        await insertMembers(tx, String(conv.id), [userId, input.otherUserId])
        return conv as unknown as Conversation
      }
      const created = await orm.transaction(run)
      if (created) return created
      // 并发输家：重查赢家（按 direct_key——赢家事务提交后可见（PG 唯一索引
      // 阻塞等待保证顺序；EXISTS 查重需要成员完整——赢家事务未提交时必漏→按行查）
      const winner = await C.select().where({ type: { eq: 'direct' }, direct_key: { eq: directKey } }).run()
      if (winner.length) return winner[0] as unknown as Conversation
      throw new HttpError('Conversation creation failed', 500) // 理论不可达（赢家必须存在）
    }
    const memberIds = [userId, ...input.memberIds.filter((m) => m !== userId)]
    return createConversationRow(userId, 'group', memberIds)
  }

  async function createConversationRow(
    createdBy: string,
    type: 'direct' | 'group',
    memberIds: string[],
  ): Promise<Conversation> {
    // M10 修复（2027-XX）：事务注入（连接级——pool.begin 亲和）；原 BEGIN/COMMIT
    // unsafe 在连接池下断裂（每条语句任意连接的 acquire/release——实证）
    const run = async (tx: Orm): Promise<Conversation> => {
      const Ctx = tx.table(CONVERSATIONS)
      const rows = await Ctx.insert({ type, created_by: createdBy }).run()
      const conv = rows[0]
      await insertMembers(tx, String(conv.id), memberIds)
      return conv as unknown as Conversation
    }
    return orm.transaction(run)
  }

  async function listConversations(userId: string): Promise<Conversation[]> {
    // M3（2027-XX）：重构为 Query Language 三步——① 成员 JOIN 会话 ② 每会话
    // last_message（索引命中 limit 1）+ unread（count）③ 最近活动倒序 JS 排序。
    // 原实现：真库专用 raw SQL（to_jsonb 标量子查询——memory 不可测——零测试盲区）
    // + ORDER BY created_at（与签名「按最近活动倒序」不符——旧会话收新消息不置顶）。
    const convs = await orm.query.from(`${MEMBERS} m`)
      .join(`${CONVERSATIONS} c`, { 'c.id': { col: 'm.conversation_id' } })
      .where({ 'm.user_id': { eq: userId } })
      .select('c.id', 'c.type', 'c.created_by', 'c.created_at', 'm.last_read_at')
      .run()
    const out: Conversation[] = []
    for (const r of convs) {
      const convId = String(r.id)
      const last = await MSG.select().where({
        conversation_id: { eq: convId },
        deleted_at: { isNull: true },
      }).orderBy('created_at', 'desc').orderBy('id', 'desc').limit(1).run()
      // unread = 未删 + 非本人（sender_id IS DISTINCT FROM u——null 等价 or 表达）+ last_read_at 后
      const unread = await MSG.select().where({
        conversation_id: { eq: convId },
        deleted_at: { isNull: true },
        ...(r.last_read_at ? { created_at: { gt: String(r.last_read_at) } } : {}),
        or: [{ sender_id: { isNull: true } }, { sender_id: { ne: userId } }],
      }).count().run()
      out.push({
        id: convId,
        type: r.type as Conversation['type'],
        created_by: r.created_by as string | null,
        created_at: new Date(r.created_at as Date).toISOString(),
        last_message: last.length ? normalizeMessage(last[0]) : null,
        unread_count: Number((unread[0] as unknown as { count: string }).count),
      } as Conversation)
    }
    // 最近活动倒序（last message 时间；无消息 → 会话创建时间兜底）
    out.sort((x, y) => {
      const tx = x.last_message ? Date.parse(x.last_message.created_at) : Date.parse(x.created_at)
      const ty = y.last_message ? Date.parse(y.last_message.created_at) : Date.parse(y.created_at)
      return ty - tx
    })
    return out
  }

  async function getConversationForUser(conversationId: string, userId: string): Promise<Conversation | null> {
    if (!(await isMember(conversationId, userId))) return null
    const rows = await C.select().where({ id: { eq: conversationId } }).run()
    return rows.length ? (rows[0] as unknown as Conversation) : null
  }

  async function isMember(conversationId: string, userId: string): Promise<boolean> {
    return MB.exists({ conversation_id: { eq: conversationId }, user_id: { eq: userId } })
  }

  // ── 消息 ──
  async function sendMessage(conversationId: string, input: SendMessageInput): Promise<Message> {
    const rows = await MSG.insert({
      conversation_id: conversationId,
      sender_type: input.senderType,
      sender_id: input.senderId ?? null,
      content: input.content,
      msg_type: input.msgType ?? 'text',
    }).run()
    return normalizeMessage(rows[0])
  }

  async function listMessages(
    conversationId: string,
    opts: { before?: string; limit?: number },
  ): Promise<Message[]> {
    const limit = opts.limit ?? 50
    const q = MSG.select().where({ conversation_id: { eq: conversationId } })
    // 游标分页：无 before 全查；有 before → 元组比较 (created_at, id) < (b.created_at, b.id) 拆 OR 组
    if (opts.before) {
      const [before] = await MSG.select('created_at', 'id').where({ id: { eq: opts.before } }).run()
      if (before) {
        q.where({
          or: [
            { created_at: { lt: before.created_at as string } },
            { created_at: { eq: before.created_at as string }, id: { lt: before.id as string } },
          ],
        })
      }
    }
    const rows = await q.orderBy('created_at', 'desc').orderBy('id', 'desc').limit(limit).run()
    return rows.map(normalizeMessage)
  }

  async function editMessage(messageId: string, content: string): Promise<Message | null> {
    const rows = await MSG.update({ content, edited_at: new Date().toISOString() })
      .where({ id: { eq: messageId }, deleted_at: { isNull: true } })
      .returning('*')
      .run()
    return rows.length ? normalizeMessage(rows[0]) : null
  }

  async function deleteMessage(messageId: string): Promise<boolean> {
    const rows = await MSG.update({ deleted_at: new Date().toISOString() })
      .where({ id: { eq: messageId }, deleted_at: { isNull: true } })
      .returning('id')
      .run()
    return rows.length > 0
  }

  async function markRead(conversationId: string, userId: string): Promise<void> {
    await MB.update({ last_read_at: new Date().toISOString() })
      .where({ conversation_id: { eq: conversationId }, user_id: { eq: userId } })
      .run()
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
    redisSub?.connect()?.then(() => {
      redisSub.psubscribe(`${REDIS_PREFIX}*`, (channel: string, message: string) => {
        try {
          // 跨进程消息 → 本地广播（不重发 Redis，避免环）
          const room = channel.slice(REDIS_PREFIX.length)
          const event = JSON.parse(message) as MsgEvent & { _pid?: string }
          // 本进程 publish 的环回消息跳过（已本地直发过）——否则每个事件发两次，客户端乱序/重复
          if (event._pid === SELF_PID) return
          broadcastLocal(room, event)
        } catch {
          // M6（2027-XX）：畸形/外来消息忽略——原无 try/catch——JSON.parse 抛崩订阅回调
        }
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

  /** 标准协议：connected / subscribe→subscribed / unsubscribe / ping→pong
   *  M15（2027-XX）：opts.verifyToken/authorizeRoom 注入——订阅前身份 + 房间授权校验
   *  （原实现升级不跑中间件 ctx.user 不可用——任意客户端可订阅任意 room 窃听——设计缺口） */
  function handler(opts?: MessagerHandlerOptions): WebSocketHandler {
    // 连接 → userId 绑定（close/error 清理）
    const wsUsers = new Map<import('ws').WebSocket, string>()
    return {
      async open(ws, ctx) {
        if (opts?.verifyToken) {
          const token = (ctx.query as Record<string, string>).token
          if (token) {
            const payload = await opts.verifyToken(token)
            if (payload?.sub) wsUsers.set(ws, payload.sub)
          }
          // 未验证：发 unauthorized（不 connected——不可订阅）
          if (!wsUsers.has(ws)) {
            ws.send(JSON.stringify({ type: 'unauthorized' }))
            return
          }
        }
        ws.send(JSON.stringify({ type: 'connected' }))
      },
      async message(ws, _ctx, data) {
        try {
          const msg = JSON.parse(data.toString()) as { type?: string; room?: string }
          if (msg.type === 'ping') {
            ws.send(JSON.stringify({ type: 'pong' }))
          } else if (msg.type === 'subscribe' && msg.room) {
            // M15：鉴权注入下——未验证身份 / 未授权房间 → 拒绝订阅（error 事件）
            if (opts?.verifyToken) {
              const userId = wsUsers.get(ws)
              if (!userId) {
                ws.send(JSON.stringify({ type: 'error', code: 'unauthorized', room: msg.room }))
                return
              }
              if (opts.authorizeRoom && !(await opts.authorizeRoom(userId, msg.room))) {
                ws.send(JSON.stringify({ type: 'error', code: 'forbidden', room: msg.room }))
                return
              }
            }
            join(msg.room, ws)
            ws.send(JSON.stringify({ type: 'subscribed', room: msg.room }))
          } else if (msg.type === 'unsubscribe' && msg.room) {
            leave(msg.room, ws)
          }
        } catch { /* 忽略畸形消息 */ }
      },
      close(ws) {
        leaveAll(ws)
        wsUsers.delete(ws)
      },
      error(ws) {
        leaveAll(ws)
        wsUsers.delete(ws)
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
  mw.__meta = { injects: ['msg'], depends: [] } // sql/redis 构造注入（options），非 ctx 读取

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
      // M12（2027-XX）：limit clamp 1..100——原实现 Number() 无上限（全量拉取 DoS）
      const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') ?? 50) || 50))
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

    // 编辑消息（先鉴权后写——M2：原实现 editMessage 先执行、归属校验后置——
    // 403 应答时内容已被篡改——实证；非成员/不存在统一 400——M2b 不泄露存在性）
    app.patch(`${p}/messages/:id`, async (req, ctx) => {
      if (!ctx.user) throw new HttpError('Unauthorized', 401)
      const messageId = ctx.params.id as string
      const body = (await req.json().catch(() => ({}))) as { content?: string }
      if (!body.content?.trim()) return badRequest('content is required')
      // 成员门控查询（JOIN members——仅成员可触达消息行）
      const rows = await orm.query.from(`${MESSAGES} m`)
        .join(`${MEMBERS} mem`, { 'mem.conversation_id': { col: 'm.conversation_id' } })
        .where({ 'm.id': { eq: messageId }, 'mem.user_id': { eq: String(ctx.user.id) } })
        .select('m.conversation_id', 'm.sender_type', 'm.sender_id')
        .run()
      if (!rows.length) return badRequest('message not found')
      const row = rows[0] as Row
      if (row.sender_type === 'user' && row.sender_id !== ctx.user.id) {
        throw new HttpError('Forbidden: not your message', 403)
      }
      const edited = await editMessage(messageId, body.content) // 鉴权通过后才写（M2）
      if (!edited) return badRequest('message not found') // 竞态：写前被并发删除
      broadcast(`conv:${edited.conversation_id}`, { type: 'message_edited', message: edited })
      return ok(edited)
    })

    // 删除消息（软删 + 广播 message_deleted——成员门控 + 先鉴权后删——M2b 对齐）
    app.delete(`${p}/messages/:id`, async (req, ctx) => {
      if (!ctx.user) throw new HttpError('Unauthorized', 401)
      const messageId = ctx.params.id as string
      const rows = await orm.query.from(`${MESSAGES} m`)
        .join(`${MEMBERS} mem`, { 'mem.conversation_id': { col: 'm.conversation_id' } })
        .where({ 'm.id': { eq: messageId }, 'mem.user_id': { eq: String(ctx.user.id) } })
        .select('m.conversation_id', 'm.sender_type', 'm.sender_id')
        .run()
      if (!rows.length) return badRequest('message not found')
      const row = rows[0] as Row
      if (row.sender_type === 'user' && row.sender_id !== ctx.user.id) {
        throw new HttpError('Forbidden: not your message', 403)
      }
      await deleteMessage(messageId)
      broadcast(`conv:${row.conversation_id}`, { type: 'message_deleted', messageId })
      return noContent()
    })
  }

  return mw
}

// ── 声明式 Schema（DDL 算子化——业务零 SQL 字符串；迁移编排：pg.migrateModule('weifuwu-messager', WEIFUWU_MESSAGER_SCHEMA)） ──
export const WEIFUWU_MESSAGER_SCHEMA = {
  tables: [
    {
      name: '_weifuwu_conversations',
      columns: {
        id: f.pk(z.uuid()),
        type: z.string().meta({ default: 'direct' }),
        created_by: z.uuid(),
        direct_key: z.string().meta({ unique: true }),
        created_at: z.date().meta({ default: 'now' }),
      },
    },
    {
      name: '_weifuwu_conversation_members',
      columns: {
        conversation_id: f.req(z.uuid()).meta({ references: '_weifuwu_conversations', onDelete: 'cascade' }),
        user_id: f.req(z.uuid()),
        last_read_at: z.date(),
        joined_at: z.date().meta({ default: 'now' }),
      },
      uniques: [['conversation_id', 'user_id']],
    },
    {
      name: '_weifuwu_messages',
      columns: {
        id: f.pk(z.uuid()),
        conversation_id: f.req(z.uuid()).meta({ references: '_weifuwu_conversations', onDelete: 'cascade' }),
        sender_type: z.string().meta({ default: 'user' }),
        sender_id: z.uuid(),
        content: z.string().meta({ notNull: true }),
        msg_type: z.string().meta({ default: 'text' }),
        created_at: z.date().meta({ default: 'now' }),
        edited_at: z.date(),
        deleted_at: z.date(),
      },
      indexes: [{ cols: ['conversation_id', { col: 'created_at', desc: true }, { col: 'id', desc: true }], name: 'idx_messages_conv' }],
    },
  ],
} satisfies import('../db/schema.ts').SchemaModule

