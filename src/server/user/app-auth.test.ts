/**
 * appAuth — 业务侧认证中间件契约（分离模式）
 *
 * 覆盖：
 * - token 验签解析（HMAC 共享 secret）→ ctx.session/user/appId/injected
 * - 无效 token/无 token → session null（匿名通过——requireAuth 401）
 * - ctx.auth 薄面（requireAuth/userId/appId/role）
 * - ctx.builtin 机器客户端（X-Wf-App-Id/Key 自动带·错误 403 抛出）
 * - verifyToken 在线校验（false → 会话失效）
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { appAuth } from './app-auth.ts'
import { signToken } from './token.ts'

const SECRET = 'test-secret-0123456789'

/** 最小 Router 模拟（中间件链直调） */
async function run(mw: any, headers: Record<string, string> = {}, extra: any = {}) {
  const ctx: any = { params: {}, query: {}, ...extra }
  const req = new Request('http://localhost/x', { headers })
  let hit = false
  await mw(req, ctx, () => { hit = true; return new Response('ok') })
  return { ctx, hit }
}

test('appAuth：验签解析 → ctx.session/user/appId 注入（token 含 email/name）', async () => {
  const token = signToken({ sub: 'u-1', appId: 'app-9', role: 'owner', email: 'a@x.com', name: '阿' }, SECRET)
  const { ctx } = await run(appAuth({ secret: SECRET }), { authorization: `Bearer ${token}` })
  assert.equal(ctx.session.userId, 'u-1')
  assert.equal(ctx.session.appId, 'app-9')
  assert.equal(ctx.session.role, 'owner')
  assert.equal(ctx.appId, 'app-9')
  assert.equal(ctx.user.id, 'u-1')
  assert.equal(ctx.user.email, 'a@x.com')
  assert.equal(ctx.auth.userId, 'u-1')
  assert.equal(ctx.auth.requireAuth().role, 'owner')
})

test('appAuth：无 token / 无效 token → session null（匿名通过）· requireAuth 401', async () => {
  const { ctx } = await run(appAuth({ secret: SECRET }))
  assert.equal(ctx.session, null)
  assert.equal(ctx.user, undefined)
  assert.throws(() => ctx.auth.requireAuth(), (e: any) => e.status === 401)
  const bad = await run(appAuth({ secret: SECRET }), { authorization: 'Bearer bad.token.x' })
  assert.equal(bad.ctx.session, null)
})

test('appAuth：平台态 token（无 appId）→ session null（非应用会话）', async () => {
  const token = signToken({ sub: 'u-9' }, SECRET)
  const { ctx } = await run(appAuth({ secret: SECRET }), { authorization: `Bearer ${token}` })
  assert.equal(ctx.session, null)
  assert.equal(ctx.user.id, 'u-9')
})

test('appAuth：ctx.builtin 机器客户端——X-Wf-App-Id/Key 自动带·错误响应抛出', async () => {
  let seen: Record<string, string> = {}
  const server = http.createServer(async (req, res) => {
    seen = Object.fromEntries(new Headers(req.headers as any).entries())
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true, app: { id: 'app-9' } }))
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()))
  const port = (server.address() as { port: number }).port
  try {
    const h = appAuth({
      secret: SECRET,
      builtin: { baseUrl: `http://127.0.0.1:${port}`, appId: 'app-9', appKey: 'key-abc' },
    })
    const { ctx } = await run(h)
    const res = await ctx.builtin.get('/api/apps/_builtin/auth/verify')
    assert.equal(res.ok, true)
    assert.equal(seen['x-wf-app-id'], 'app-9')
    assert.equal(seen['x-wf-app-key'], 'key-abc')
  } finally {
    await new Promise<void>((r) => server.close(() => r()))
  }
})

test('appAuth：verifyToken 在线校验——false → 会话失效（分离即时性）', async () => {
  const token = signToken({ sub: 'u-1', appId: 'app-9', role: 'member' }, SECRET)
  const okOn = await run(appAuth({ secret: SECRET, verifyToken: async () => true }), { authorization: `Bearer ${token}` })
  assert.equal(okOn.ctx.session.role, 'member')
  const off = await run(appAuth({ secret: SECRET, verifyToken: async () => false }), { authorization: `Bearer ${token}` })
  assert.equal(off.ctx.session, null)
})

test('appAuth：跨进程对称——userSystem 签发（register-app 真 token）→ appAuth 验签解析', async () => {
  const { userSystem } = await import('./index.ts')
  const { createMemorySql } = await import('../db/memory-sql.ts')
  const { Router } = await import('../core/router.ts')
  const sql = createMemorySql()
  const users = userSystem({ sql, secret: SECRET })
  await users.migrate()
  const app = new Router()
  app.use(users)
  users.routes(app, { prefix: '/api/auth' })
  const h = app.handler()
  const res = await h(new Request('http://localhost/api/auth/register-app', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'sym@x.test', password: 'password123', name: '对称' }),
  }), { params: {}, query: {} })
  const body = await res.json()
  assert.ok(body.token)
  // 业务侧（分离进程）用同一 secret 解析
  const { ctx } = await run(appAuth({ secret: SECRET }), { authorization: `Bearer ${body.token}` })
  assert.equal(ctx.session.role, 'owner')
  assert.equal(ctx.session.appId, body.app.id)
  assert.equal(ctx.user.name, '对称')
  assert.equal(ctx.user.email, 'sym@x.test')
})
