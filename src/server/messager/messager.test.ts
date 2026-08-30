/**
 * messager — 消息系统核心服务测试（CS-04：真库 docker postgres）
 *
 * P1 覆盖：会话创建（direct 同对用户唯一/group 成员）、发送消息（sender_type 泛化）、
 * 历史游标分页、会话列表（最后消息 + 未读数）、编辑/删除软删、迁移幂等。
 *
 * 注意：userId 直接传字符串（核心服务不依赖 userSystem，路由层才接 ctx.user）。
 */
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { createMemorySql } from '../db/memory-sql.ts'
import { MemorySql } from '../db/memory-sql.ts'
import { createQueryBuilder } from '../db/query-builder.ts'
import { messager } from '../messager/index.ts'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

describe('messager core (memory sql)', () => {
  const db = createMemorySql()
  const system = messager({ sql: db })
  const msg = system.client

  before(async () => {
    // MemorySql 惰性建表（无 migrate）——migrate = DDL no-op
    await system.migrate()
  })

  after(async () => {
    await db.close()
  })

  const uid = () => randomUUID()
  const mkConv = (a: string, b: string) => msg.createConversation(a, { type: 'direct', otherUserId: b })

  it('migrate 幂等（调用两次不抛）', async () => {
    await system.migrate()
  })

  it('创建 direct 会话并写入双方成员', async () => {
    const a = uid(), b = uid()
    const conv = await mkConv(a, b)
    assert.ok(conv.id)
    assert.equal(conv.type, 'direct')
    const ma = await msg.isMember(conv.id, a)
    const mb = await msg.isMember(conv.id, b)
    assert.equal(ma, true)
    assert.equal(mb, true)
  })

  it('direct 会话同对用户唯一（二次创建返回同一会话）', async () => {
    const a = uid(), b = uid()
    const c1 = await mkConv(a, b)
    const c2 = await mkConv(b, a) // 顺序无关
    assert.equal(c1.id, c2.id)
  })

  it('创建 group 会话并写入全部成员', async () => {
    const creator = uid(), x = uid(), y = uid()
    const conv = await msg.createConversation(creator, { type: 'group', memberIds: [x, y] })
    assert.equal(conv.type, 'group')
    assert.equal(await msg.isMember(conv.id, creator), true)
    assert.equal(await msg.isMember(conv.id, x), true)
    assert.equal(await msg.isMember(conv.id, y), true)
    assert.equal(await msg.isMember(conv.id, uid()), false)
  })

  it('发送消息并持久化 sender_type 泛化（user/agent 都可发）', async () => {
    const a = uid(), b = uid()
    const conv = await mkConv(a, b)
    const m = await msg.sendMessage(conv.id, { senderType: 'user', senderId: a, content: '你好' })
    assert.ok(m.id)
    assert.equal(m.sender_type, 'user')
    assert.equal(m.content, '你好')
    const m2 = await msg.sendMessage(conv.id, { senderType: 'agent', senderId: uid(), content: 'AI 回复', msgType: 'text' })
    assert.equal(m2.sender_type, 'agent')
  })

  it('历史消息游标分页（before + limit，倒序）', async () => {
    const a = uid(), b = uid()
    const conv = await mkConv(a, b)
    for (let i = 0; i < 5; i++) {
      await msg.sendMessage(conv.id, { senderType: 'user', senderId: a, content: `msg-${i}` })
      await sleep(2) // 内存毫秒精度——真库微秒（游标 (created_at, id) 元组比较近似）
    }
    const page1 = await msg.listMessages(conv.id, { limit: 2 })
    assert.equal(page1.length, 2)
    assert.equal(page1[0].content, 'msg-4') // 倒序：最新在前
    const page2 = await msg.listMessages(conv.id, { before: page1[page1.length - 1].id, limit: 2 })
    assert.equal(page2.length, 2)
    assert.equal(page2[0].content, 'msg-2')
    // 游标继续翻完
    const page3 = await msg.listMessages(conv.id, { before: page2[page2.length - 1].id, limit: 10 })
    assert.equal(page3.length, 1)
    assert.equal(page3[0].content, 'msg-0')
  })

  // 会话列表（last_message/unread_count 聚合）保留真库 unsafe 优化 SQL——
  // 由 messager-routes 真库测试覆盖（JOIN + 标量子查询 + COALESCE 超出内存子集——诚实裁剪）

  it('编辑消息（edited_at 写入，内容更新）', async () => {
    const a = uid(), b = uid()
    const conv = await mkConv(a, b)
    const m = await msg.sendMessage(conv.id, { senderType: 'user', senderId: a, content: '原文' })
    const edited = await msg.editMessage(m.id, '改后')
    assert.equal(edited?.content, '改后')
    assert.ok(edited?.edited_at)
    const list = await msg.listMessages(conv.id, {})
    assert.equal(list[0].content, '改后')
  })

  it('删除消息（软删 deleted_at 写入）', async () => {
    const a = uid(), b = uid()
    const conv = await mkConv(a, b)
    const m = await msg.sendMessage(conv.id, { senderType: 'user', senderId: a, content: '待删' })
    const ok = await msg.deleteMessage(m.id)
    assert.equal(ok, true)
    const list = await msg.listMessages(conv.id, {})
    assert.equal(list.length, 1) // 仍在（软删）
    assert.ok(list[0].deleted_at)
  })

  it('M9 并发 direct 创建（同对用户）→ 恰一会话（unique(direct_key) 零窗口）', async () => {
    const a = uid(), b = uid()
    const [r1, r2] = await Promise.all([
      msg.createConversation(a, { type: 'direct', otherUserId: b }),
      msg.createConversation(b, { type: 'direct', otherUserId: a }), // 顺序无关
    ])
    assert.equal(r1.id, r2.id, '并发查-插窗口：同一会话（原实现双会话——实证）')
    // 成员恰两名
    assert.equal(await msg.isMember(r1.id, a), true)
    assert.equal(await msg.isMember(r1.id, b), true)
  })

  it('M10 transaction 注入：conv+members 全部经事务 sql（连接级——原 BEGIN/COMMIT 池化断裂）', async () => {
    // 同 mem 引擎双包装：base（pool sql——计数不记）+ tx（事务 sql——计数）
    const mem = new MemorySql()
    let txExecs = 0
    const makeSql = (count: boolean) => {
      const s = (async (tag: TemplateStringsArray, ...v: unknown[]) => mem.tag(tag, v)) as any
      s.query = createQueryBuilder(s, async (q: any) => {
        if (count) txExecs++
        return mem.executeQuery(q)
      })
      s.unsafe = (t: string, p?: unknown[]) => (mem as any).unsafe(t, p)
      s.close = () => (mem as any).close()
      return s
    }
    const baseSql = makeSql(false)
    const txSql = makeSql(true)
    const txSystem = messager({
      sql: baseSql,
      transaction: async (fn) => fn(txSql), // shape：pool.begin 语义（连接级）
    })
    await txSystem.migrate() // 建表在 mem 引擎（base/tx 共享）
    // direct 路径：pre-check（base sql）+ 事务内 conv+2 members
    const conv = await txSystem.client.createConversation('m10-a', { type: 'direct', otherUserId: 'm10-b' })
    assert.ok(conv.id)
    assert.equal(txExecs, 3, 'M10：conv insert + 2× members insert 全经事务 sql（3 次）')
    const members = await txSql.query.from('_weifuwu_conversation_members').select('user_id').run()
    assert.equal(members.length, 2, '事务内成员写入生效')
    // group 路径：事务内 conv + N members（创建者 + 2 = 3 成员）
    txExecs = 0
    await txSystem.client.createConversation('m10-g', { type: 'group', memberIds: ['m10-x', 'm10-y'] })
    assert.equal(txExecs, 4, 'group：conv + 3 members（含创建者）全经事务 sql')
    const gmembers = await txSql.query.from('_weifuwu_conversation_members').where({ conversation_id: (await txSql.query.from('_weifuwu_conversations').where({ type: 'group' }).select('id').one())?.id as string }).select('user_id').run()
    assert.equal(gmembers.length, 3)
    await (txSql as any).close()
    await (baseSql as any).close()
  })

  it('M3 会话列表：按最近活动倒序 + last_message + unread_count', async () => {
    const a = uid(), b = uid(), c = uid()
    const conv1 = await mkConv(a, b) // 先建（老会话）
    const conv2 = await mkConv(a, c) // 后建（新会话——原实现排最前）
    await msg.sendMessage(conv2.id, { senderType: 'user', senderId: a, content: '新会话先发' })
    await sleep(5)
    await msg.sendMessage(conv1.id, { senderType: 'user', senderId: b, content: '老会话来新消息' })
    const list = await msg.listConversations(a)
    assert.equal(list.length, 2)
    assert.equal(list[0].id, conv1.id, 'M3：最近活动倒序——conv1 最新活动置顶（原实现按创建时间）')
    assert.equal(list[0].last_message?.content, '老会话来新消息')
    assert.equal(list[0].unread_count, 1, 'unread：b 的消息（a 视角）')
    const conv2Entry = list.find((t) => t.id === conv2.id)!
    assert.equal(conv2Entry.last_message?.content, '新会话先发')
    assert.equal(conv2Entry.unread_count, 0, 'a 自己的消息不计未读')
    // 软删消息不进 last_message / 但 unread 也不计（未删限定）
    const m = await msg.sendMessage(conv2.id, { senderType: 'user', senderId: c, content: '将被软删' })
    await msg.deleteMessage(m.id)
    const list2 = await msg.listConversations(a)
    const conv2Entry2 = list2.find((t) => t.id === conv2.id)!
    assert.equal(conv2Entry2.last_message?.content, '新会话先发', '软删不进 last_message')
  })

  it('非成员查询会话返回 null；成员可查', async () => {
    const a = uid(), b = uid(), outsider = uid()
    const conv = await mkConv(a, b)
    assert.ok(await msg.getConversationForUser(conv.id, a))
    assert.equal(await msg.getConversationForUser(conv.id, outsider), null)
  })
})
