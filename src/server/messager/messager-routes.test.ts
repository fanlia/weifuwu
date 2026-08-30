/**
 * messager — 路由层契约测试（P3：HTTP API + ctx.user 注入——userSystem 可选依赖替身）
 *
 * 覆盖：M2 编辑越权（403/400 前不得写入——原缺陷：editMessage 先执行、鉴权后置
 * → 403 应答时内容已被篡改）、M2b 非成员不可探测（成员门控查询——统一 400）、
 * limit clamp、匿名 401、会话成员校验。
 */
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { createMemorySql } from '../db/memory-sql.ts'
import { messager } from '../messager/index.ts'
import { Router } from '../core/router.ts'

describe('messager routes（P3——M2 越权修复锁定）', () => {
  const db = createMemorySql()
  const system = messager({ sql: db })
  let currentUser: string | null = 'a-user'
  const app = new Router()
  // 用户系统可选依赖替身：路由层只读 ctx.user
  app.use(async (_req: Request, ctx: any, next: any) => {
    ctx.user = currentUser ? { id: currentUser } : null
    return next(_req, ctx)
  })
  app.use(system)
  system.routes(app)
  const handler = app.handler()
  const setUser = (id: string | null) => { currentUser = id }

  before(async () => { await system.migrate() })
  after(async () => { await db.close() })

  const uid = () => randomUUID()

  async function req(method: string, path: string, body?: unknown) {
    return handler(new Request(`http://localhost${path}`, {
      method,
      headers: body ? { 'content-type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    }), { params: {}, query: {} } as any)
  }

  /** 建 direct 会话（A 视角）——返回 conv */
  async function mkConv(other: string) {
    const res = await req('POST', '/api/messages/conversations', { type: 'direct', otherUserId: other })
    assert.equal(res.status, 201)
    return (await res.json()) as { id: string }
  }

  describe('M2 编辑越权（先鉴权后写）', () => {
    it('非发送者 PATCH → 403 且消息内容不变（原缺陷 403 前已写入）', async () => {
      const b = uid()
      const conv = await mkConv(b)
      const sent = await req('POST', `/api/messages/conversations/${conv.id}/messages`, { content: 'A 的秘密' })
      assert.equal(sent.status, 201)
      const m = await sent.json()

      setUser(b) // B = 会话成员但非发送者
      const res = await req('PATCH', `/api/messages/messages/${m.id}`, { content: 'B 篡改' })
      assert.equal(res.status, 403, '非发送者 → 403')
      const list = await system.client.listMessages(conv.id, {})
      assert.equal(list[0].content, 'A 的秘密', 'M2：403 前不得写入（内容必须未变）')
      assert.equal(list[0].edited_at, null, 'edited_at 不得被写入')
    })

    it('非成员 PATCH → unified 400（成员门控查询——不泄露消息存在性）', async () => {
      const a = uid(), b = uid()
      const conv = await mkConv(b)
      const sent = await req('POST', `/api/messages/conversations/${conv.id}/messages`, { content: '内部' })
      const m = await sent.json()
      setUser(a) // 非成员
      const res = await req('PATCH', `/api/messages/messages/${m.id}`, { content: 'x' })
      assert.equal(res.status, 400, 'M2b：非成员统一 400（同消息不存在）')
      const list = await system.client.listMessages(conv.id, {})
      assert.equal(list[0].content, '内部')
    })

    it('发送者本人 PATCH → 200 + 内容更新（既有行为保持）', async () => {
      setUser('a-user') // 会话属于 a-user（先复位再建会话）
      const b = uid()
      const conv = await mkConv(b)
      const sent = await req('POST', `/api/messages/conversations/${conv.id}/messages`, { content: '原文' })
      const m = await sent.json()
      const res = await req('PATCH', `/api/messages/messages/${m.id}`, { content: '自己改' })
      assert.equal(res.status, 200)
      const edited = await res.json()
      assert.equal(edited.content, '自己改')
      assert.ok(edited.edited_at)
    })

    it('不存在消息 PATCH → 400', async () => {
      setUser('a-user')
      const res = await req('PATCH', `/api/messages/messages/${uid()}`, { content: 'x' })
      assert.equal(res.status, 400)
    })

    it('匿名 PATCH → 401', async () => {
      const b = uid()
      const conv = await mkConv(b)
      const sent = await req('POST', `/api/messages/conversations/${conv.id}/messages`, { content: 'x' })
      setUser(null)
      const res = await req('PATCH', `/api/messages/messages/${(await sent.json()).id}`, { content: 'y' })
      assert.equal(res.status, 401)
      setUser('a-user')
    })
  })

  describe('M2b 删除路由（成员门控）', () => {
    it('非成员 DELETE → 统一 400（不泄露存在性）', async () => {
      const b = uid()
      const conv = await mkConv(b)
      const sent = await req('POST', `/api/messages/conversations/${conv.id}/messages`, { content: '待删' })
      const m = await sent.json()
      setUser(uid()) // 非成员
      const res = await req('DELETE', `/api/messages/messages/${m.id}`)
      assert.equal(res.status, 400)
      setUser('a-user')
    })

    it('发送者 DELETE → 204 软删；非发送者成员 → 403', async () => {
      const b = uid()
      const conv = await mkConv(b)
      const sent = await req('POST', `/api/messages/conversations/${conv.id}/messages`, { content: '待删' })
      const m = await sent.json()
      setUser(b)
      const res2 = await req('DELETE', `/api/messages/messages/${m.id}`)
      assert.equal(res2.status, 403, '非发送者成员 → 403')
      setUser('a-user')
      const res1 = await req('DELETE', `/api/messages/messages/${m.id}`)
      assert.equal(res1.status, 204)
      const list = await system.client.listMessages(conv.id, {})
      assert.ok(list[0].deleted_at, '软删生效')
    })
  })

  describe('limit clamp（M12）', () => {
    it('limit=100000 → clamp 100；limit=-5 → 1；无参数 → 50', async () => {
      const b = uid()
      const conv = await mkConv(b)
      for (let i = 0; i < 120; i++) {
        await req('POST', `/api/messages/conversations/${conv.id}/messages`, { content: `m${i}` })
      }
      const big = await req('GET', `/api/messages/conversations/${conv.id}/messages?limit=100000`)
      assert.equal((await big.json()).length, 100, 'clamp 到 100（M12 上限——原实现全量拉取）')
      const defaultP = await req('GET', `/api/messages/conversations/${conv.id}/messages`)
      assert.equal((await defaultP.json()).length, 50, '默认 50')
      const neg = await req('GET', `/api/messages/conversations/${conv.id}/messages?limit=-5`)
      assert.equal((await neg.json()).length, 1, '负值 → 1')
      const zero = await req('GET', `/api/messages/conversations/${conv.id}/messages?limit=0`)
      assert.equal((await zero.json()).length, 50, '0 → 50（兜底）')
    })
  })

  describe('会话成员校验（保持）', () => {
    it('非成员 GET 历史 → 403；匿名 → 401', async () => {
      const b = uid()
      const conv = await mkConv(b)
      setUser(uid())
      const outsider = await req('GET', `/api/messages/conversations/${conv.id}/messages`)
      assert.equal(outsider.status, 403)
      setUser(null)
      const anon = await req('GET', `/api/messages/conversations/${conv.id}/messages`)
      assert.equal(anon.status, 401)
      setUser('a-user')
    })
  })
})
