/**
 * userSystem — 用户系统测试（CS-04：真库 docker postgres）
 *
 * 覆盖：注册/登录/登出/me/refresh 轮换、scrypt 哈希（非明文）、
 * token 过期与篡改、401 防枚举、setPassword、createToken、迁移幂等。
 *
 * 注意：每个测试用唯一 email（randomUUID）——真库持久 + 测试并行安全。
 */
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { postgres } from '../postgres/index.ts'
import { userSystem } from '../user/index.ts'
import { verifyPassword } from '../user/password.ts'
import { verifyToken, signToken } from '../user/token.ts'
import { Router } from '../core/router.ts'

const mkCtx = () => ({ params: {}, query: {} })

describe('userSystem (real postgres)', () => {
  const db = postgres()
  const users = userSystem({ sql: db.sql, secret: 'test-secret-0123456789abcdef' })

  const app = new Router()
  app.use(db)
  app.use(users)
  users.routes(app)
  const handler = app.handler()

  before(async () => {
    await db.migrate()
    await users.migrate()
  })

  after(async () => {
    await db.close()
  })

  const uniqEmail = () => `user-${randomUUID()}@test.local`

  async function post(path: string, body: unknown, token?: string) {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (token) headers.Authorization = `Bearer ${token}`
    return handler(
      new Request(`http://localhost${path}`, { method: 'POST', headers, body: JSON.stringify(body) }),
      mkCtx(),
    )
  }

  async function get(path: string, token?: string) {
    const headers: Record<string, string> = {}
    if (token) headers.Authorization = `Bearer ${token}`
    return handler(new Request(`http://localhost${path}`, { headers }), mkCtx())
  }

  /** 直接调中间件拿注入的 ctx（绕路由，访问 ctx.auth 方法面） */
  async function authCtx(token?: string) {
    const ctx: any = {}
    const req = new Request('http://localhost/', {
      headers: token ? { authorization: `Bearer ${token}` } : {},
    })
    await users(req, ctx, async () => new Response('ok'))
    return ctx
  }

  describe('register', () => {
    it('201 + token/refreshToken/user；密码以 scrypt 哈希入库（非明文）', async () => {
      const email = uniqEmail()
      const res = await post('/api/auth/register', { email, password: 'password123' })
      assert.equal(res.status, 201)
      const data = await res.json()
      assert.ok(data.token)
      assert.ok(data.refreshToken)
      assert.equal(data.user.email, email)
      assert.equal(data.user.password_hash, undefined, '不返回密码哈希')

      // DB 里是哈希且可验证
      const rows = await db.sql.unsafe('SELECT password_hash FROM _weifuwu_users WHERE email = $1', [email])
      const stored = String(rows[0].password_hash)
      assert.ok(stored.startsWith('scrypt$'))
      assert.ok(!stored.includes('password123'))
      assert.equal(await verifyPassword('password123', stored), true)
      assert.equal(await verifyPassword('wrong', stored), false)
    })

    it('重复 email → 409（23505 错误映射）', async () => {
      const email = uniqEmail()
      await post('/api/auth/register', { email, password: 'password123' })
      const res = await post('/api/auth/register', { email, password: 'password123' })
      assert.equal(res.status, 409)
    })

    it('密码太短 → 400', async () => {
      const res = await post('/api/auth/register', { email: uniqEmail(), password: 'short' })
      assert.equal(res.status, 400)
    })

    it('email 大小写归一：注册 Foo@X.com 后 login foo@x.com 成功', async () => {
      const email = `Foo-${randomUUID()}@Test.local`
      const res = await post('/api/auth/register', { email, password: 'password123' })
      assert.equal(res.status, 201)
      const data = await res.json()
      assert.equal(data.user.email, email.toLowerCase(), '入库 email 归一化为小写')
      // 用小写 email 登录成功（且不区分大小写）
      const login = await post('/api/auth/login', { email: email.toLowerCase(), password: 'password123' })
      assert.equal(login.status, 200)
      const upper = await post('/api/auth/login', { email: email.toUpperCase(), password: 'password123' })
      assert.equal(upper.status, 200)
    })
  })

  describe('login / 401 防枚举', () => {
    it('正确密码 → 200 token', async () => {
      const email = uniqEmail()
      await post('/api/auth/register', { email, password: 'password123' })
      const res = await post('/api/auth/login', { email, password: 'password123' })
      assert.equal(res.status, 200)
      const data = await res.json()
      assert.ok(data.token)
      assert.equal(data.user.email, email)
    })

    it('错误密码与不存在邮箱 → 相同 401 消息（防枚举）', async () => {
      const email = uniqEmail()
      await post('/api/auth/register', { email, password: 'password123' })
      const wrongPwd = await post('/api/auth/login', { email, password: 'wrongpass' })
      const noUser = await post('/api/auth/login', { email: uniqEmail(), password: 'password123' })
      assert.equal(wrongPwd.status, 401)
      assert.equal(noUser.status, 401)
      const [a, b] = await Promise.all([wrongPwd.text(), noUser.text()])
      assert.equal(a, b, '错误消息必须一致')
    })
  })

  describe('me / ctx.user', () => {
    it('带 token → 200 当前用户', async () => {
      const email = uniqEmail()
      const reg = await (await post('/api/auth/register', { email, password: 'password123' })).json()
      const res = await get('/api/auth/me', reg.token)
      assert.equal(res.status, 200)
      const user = await res.json()
      assert.equal(user.email, email)
    })

    it('无 token → 401', async () => {
      const res = await get('/api/auth/me')
      assert.equal(res.status, 401)
    })

    it('篡改 token → 401', async () => {
      const email = uniqEmail()
      const reg = await (await post('/api/auth/register', { email, password: 'password123' })).json()
      const tampered = reg.token.slice(0, -4) + 'AAAA'
      const res = await get('/api/auth/me', tampered)
      assert.equal(res.status, 401)
    })

    it('过期 token → 401（verifyToken 拒绝 exp 过期）', () => {
      const token = signToken({ sub: 'x' }, 'test-secret-0123456789abcdef', -1)
      assert.equal(verifyToken(token, 'test-secret-0123456789abcdef'), null)
    })
  })

  describe('refresh 轮换 / logout', () => {
    it('refresh → 新对 + 旧 refresh 失效（轮换）', async () => {
      const email = uniqEmail()
      const reg = await (await post('/api/auth/register', { email, password: 'password123' })).json()
      const r1 = await post('/api/auth/refresh', { refreshToken: reg.refreshToken })
      assert.equal(r1.status, 200)
      const data = await r1.json()
      assert.ok(data.token)
      assert.notEqual(data.refreshToken, reg.refreshToken, 'refresh 必须轮换')

      // 旧 refresh 已失效
      const r2 = await post('/api/auth/refresh', { refreshToken: reg.refreshToken })
      assert.equal(r2.status, 401)

      // 新 refresh 可用
      const r3 = await post('/api/auth/refresh', { refreshToken: data.refreshToken })
      assert.equal(r3.status, 200)
    })

    it('logout 撤销 refresh → 之后 refresh 401', async () => {
      const email = uniqEmail()
      const reg = await (await post('/api/auth/register', { email, password: 'password123' })).json()
      const out = await post('/api/auth/logout', { refreshToken: reg.refreshToken })
      assert.equal(out.status, 204)
      const r = await post('/api/auth/refresh', { refreshToken: reg.refreshToken })
      assert.equal(r.status, 401)
    })

    it('未知 refresh → 401', async () => {
      const res = await post('/api/auth/refresh', { refreshToken: 'deadbeef'.repeat(8) })
      assert.equal(res.status, 401)
    })
  })

  describe('setPassword / createToken', () => {
    it('setPassword 后旧密码失效、新密码生效', async () => {
      const email = uniqEmail()
      const reg = await (await post('/api/auth/register', { email, password: 'password123' })).json()
      const me = await (await get('/api/auth/me', reg.token)).json()
      const ctx = await authCtx(reg.token)
      await ctx.auth.setPassword(me.id, 'newpassword456')

      const oldLogin = await post('/api/auth/login', { email, password: 'password123' })
      assert.equal(oldLogin.status, 401)
      const newLogin = await post('/api/auth/login', { email, password: 'newpassword456' })
      assert.equal(newLogin.status, 200)
    })

    it('createToken → verifyToken 往返 + type 字段', async () => {
      const ctx = await authCtx()
      const token = ctx.auth.createToken('verify', { sub: 'u1' }, 3600)
      const payload = verifyToken(token, 'test-secret-0123456789abcdef')
      assert.ok(payload)
      assert.equal(payload!.type, 'verify')
      assert.equal(payload!.sub, 'u1')
    })
  })


  describe('会话 payload 合并 + 多租户注入', () => {
    it('token 携带的自定义字段合并到 ctx.auth（sub → userId）', async () => {
      const token = signToken(
        { sub: '00000000-0000-0000-0000-000000000000', tenantId: 't-456', email: 'a@b.com', role: 'admin' },
        'test-secret-0123456789abcdef',
        3600,
      )
      const ctx = await authCtx(token)
      assert.equal(ctx.auth.userId, '00000000-0000-0000-0000-000000000000', 'sub 映射为 userId')
      assert.equal(ctx.auth.tenantId, 't-456', 'payload 字段透传')
      assert.equal(ctx.auth.email, 'a@b.com')
      assert.equal(ctx.auth.role, 'admin')
      // 方法面不破坏
      assert.equal(typeof ctx.auth.requireAuth, 'function')
    })

    it('ctx.tenantId 注入（payload 带 tenantId 时）', async () => {
      const token = signToken({ sub: '00000000-0000-0000-0000-000000000000', tenantId: 't-789' }, 'test-secret-0123456789abcdef', 3600)
      const ctx = await authCtx(token)
      assert.equal(ctx.tenantId, 't-789')
    })

    it('无 token 时无 payload 字段且不注入 tenantId', async () => {
      const ctx = await authCtx()
      assert.equal(ctx.auth.userId, undefined)
      assert.equal(ctx.tenantId, undefined)
    })
  })

  describe('迁移', () => {
    it('migrate 幂等（调用两次不抛）', async () => {
      await users.migrate()
      await users.migrate()
      assert.ok(true)
    })
  })
})
