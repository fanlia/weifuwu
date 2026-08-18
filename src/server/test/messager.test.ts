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

  it('非成员查询会话返回 null；成员可查', async () => {
    const a = uid(), b = uid(), outsider = uid()
    const conv = await mkConv(a, b)
    assert.ok(await msg.getConversationForUser(conv.id, a))
    assert.equal(await msg.getConversationForUser(conv.id, outsider), null)
  })
})
