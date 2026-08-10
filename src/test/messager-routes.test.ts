/**
 * messager — 路由层 HTTP 集成测试（P3）
 *
 * CS-04：真库 docker postgres。装配 userSystem + messager 全链路：
 * 注册两用户 → 登录 → 建 direct 会话 → 发消息（持久化+广播）→ 历史分页 →
 * 编辑/删除 → 未登录 401 → 非成员 403 → 已读。
 */
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { postgres } from '../postgres/index.ts'
import { redis } from '../redis/index.ts'
import { userSystem } from '../user/index.ts'
import { messager } from '../messager/index.ts'
import { Router } from '../core/router.ts'

function mkCtx(extra: Record<string, unknown> = {}) {
  return { params: {}, query: {}, ...extra }
}

describe('messager routes (real postgres + userSystem)', () => {
  const db = postgres()
  const rds = redis()
  const users = userSystem({ sql: db.sql, secret: 'test-secret-0123456789abcdef' })
  const system = messager({ sql: db.sql, redis: rds.redis })
  const msg = system.client

  after(async () => {
    await rds.close()
  })

  const app = new Router()
  app.use(db)
  app.use(users)
  app.use(system)
  users.routes(app)
  system.routes(app)
  const handler = app.handler()

  before(async () => {
    await db.migrate()
    await users.migrate()
    await system.migrate()
  })

  after(async () => {
    await msg.close()
    await db.close()
  })

  const uniq = () => `msg-${randomUUID()}@test.local`

  /** 注册 + 登录 → 返回 { token, user } */
  async function registerAndLogin(name: string) {
    const email = uniq()
    const regRes = await handler(
      new Request('http://localhost/api/auth/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password: 'Password123', name }),
      }),
      mkCtx(),
    )
    assert.equal(regRes.status, 201)
    const reg = await regRes.json()
    return { token: reg.token, user: reg.user, email }
  }

  async function api(path: string, method: string, token: string | null, body?: unknown) {
    return handler(
      new Request(`http://localhost${path}`, {
        method,
        headers: {
          'content-type': 'application/json',
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      }),
      mkCtx(),
    )
  }

  it('未登录访问受保护路由 → 401', async () => {
    const res = await api('/api/messages/conversations', 'GET', null)
    assert.equal(res.status, 401)
  })

  it('建 direct 会话（双方 token 可查）、发消息、历史分页、编辑、删除、已读', async () => {
    const alice = await registerAndLogin('Alice')
    const bob = await registerAndLogin('Bob')

    // Alice 建 direct 会话
    const convRes = await api('/api/messages/conversations', 'POST', alice.token, {
      type: 'direct',
      otherUserId: bob.user.id,
    })
    assert.equal(convRes.status, 201)
    const conv = await convRes.json()
    assert.equal(conv.type, 'direct')

    // Bob 也能看到同一会话（唯一性 + 双方成员）
    const convsBob = await api('/api/messages/conversations', 'GET', bob.token)
    const bobList = await convsBob.json()
    assert.equal(bobList.length, 1)
    assert.equal(bobList[0].id, conv.id)

    // Alice 发消息
    const sendRes = await api(`/api/messages/conversations/${conv.id}/messages`, 'POST', alice.token, {
      content: '你好 Bob',
    })
    assert.equal(sendRes.status, 201)
    const m1 = await sendRes.json()
    assert.equal(m1.sender_id, alice.user.id)

    // 非法内容 → 400
    const badRes = await api(`/api/messages/conversations/${conv.id}/messages`, 'POST', alice.token, {
      content: '   ',
    })
    assert.equal(badRes.status, 400)

    // Bob 发消息 → 历史 2 条（倒序：Bob 在前）
    await api(`/api/messages/conversations/${conv.id}/messages`, 'POST', bob.token, { content: '你好 Alice' })
    const hist = await api(`/api/messages/conversations/${conv.id}/messages`, 'GET', alice.token)
    const msgs = await hist.json()
    assert.equal(msgs.length, 2)
    assert.equal(msgs[0].content, '你好 Alice')

    // 会话列表：未读数（Alice 视角：Bob 的 1 条未读）
    const convsA = await api('/api/messages/conversations', 'GET', alice.token)
    const aList = await convsA.json()
    assert.equal(aList[0].unread_count, 1)
    assert.equal(aList[0].last_message.content, '你好 Alice')

    // 已读 → 未读归零
    await api(`/api/messages/conversations/${conv.id}/read`, 'POST', alice.token)
    const convsA2 = await api('/api/messages/conversations', 'GET', alice.token)
    assert.equal((await convsA2.json())[0].unread_count, 0)

    // 编辑消息（Alice 编辑自己的）→ 广播数据带 edited_at
    const editRes = await api(`/api/messages/messages/${m1.id}`, 'PATCH', alice.token, { content: '你好 Bob（改）' })
    assert.equal(editRes.status, 200)
    const edited = await editRes.json()
    assert.equal(edited.content, '你好 Bob（改）')
    assert.ok(edited.edited_at)

    // Bob 不能编辑 Alice 的消息 → 403
    const forbiddenEdit = await api(`/api/messages/messages/${m1.id}`, 'PATCH', bob.token, { content: 'hack' })
    assert.equal(forbiddenEdit.status, 403)

    // 删除消息
    const delRes = await api(`/api/messages/messages/${m1.id}`, 'DELETE', alice.token)
    assert.equal(delRes.status, 204)
    const hist2 = await api(`/api/messages/conversations/${conv.id}/messages`, 'GET', alice.token)
    const msgs2 = await hist2.json()
    assert.ok(msgs2.find((m: any) => m.id === m1.id)?.deleted_at) // 软删仍在
  })

  it('非成员访问会话 → 403；第三方用户建会话看不到别人的会话', async () => {
    const alice = await registerAndLogin('Alice2')
    const bob = await registerAndLogin('Bob2')
    const carol = await registerAndLogin('Carol2')

    const convRes = await api('/api/messages/conversations', 'POST', alice.token, {
      type: 'direct',
      otherUserId: bob.user.id,
    })
    const conv = await convRes.json()

    // Carol 非成员 → 历史 403
    const histRes = await api(`/api/messages/conversations/${conv.id}/messages`, 'GET', carol.token)
    assert.equal(histRes.status, 403)

    // Carol 非成员发消息 → 403
    const sendRes = await api(`/api/messages/conversations/${conv.id}/messages`, 'POST', carol.token, {
      content: '偷看',
    })
    assert.equal(sendRes.status, 403)

    // Carol 会话列表为空
    const convsC = await api('/api/messages/conversations', 'GET', carol.token)
    assert.equal((await convsC.json()).length, 0)
  })

  it('group 会话：多方成员可见', async () => {
    const a = await registerAndLogin('G1')
    const b = await registerAndLogin('G2')
    const c = await registerAndLogin('G3')
    const convRes = await api('/api/messages/conversations', 'POST', a.token, {
      type: 'group',
      memberIds: [b.user.id, c.user.id],
    })
    const conv = await convRes.json()
    assert.equal(conv.type, 'group')
    const convsC = await api('/api/messages/conversations', 'GET', c.token)
    const cList = await convsC.json()
    assert.equal(cList.length, 1)
    assert.equal(cList[0].id, conv.id)
  })
})
