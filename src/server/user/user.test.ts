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
import { createMemorySql } from '../db/memory-sql.ts'
import { userSystem } from '../user/index.ts'
import { verifyPassword } from '../user/password.ts'
import { verifyToken, signToken, hashRefreshToken } from '../user/token.ts'
import { Router } from '../core/router.ts'

const mkCtx = () => ({ params: {}, query: {} })

describe('userSystem (memory sql)', () => {
  const db = createMemorySql()
  const users = userSystem({ sql: db, secret: 'test-secret-0123456789abcdef' })

  const app = new Router()
  app.use(users)
  users.routes(app)
  const handler = app.handler()

  before(async () => {
    // MemorySql 惰性建表（无 migrate）——userSystem 迁移 = DDL no-op
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
      const rows = await db.unsafe('SELECT password_hash FROM _weifuwu_users WHERE email = $1', [email])
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

    it('B2 并发同 refreshToken → 恰好一个成功（原子消费——单次使用）', async () => {
      const email = uniqEmail()
      const reg = await (await post('/api/auth/register', { email, password: 'password123' })).json()
      // 原缺陷：SELECT(revoked_at IS NULL) 与 revoke UPDATE 两语句窗口——并发双过
      const [r1, r2] = await Promise.all([
        post('/api/auth/refresh', { refreshToken: reg.refreshToken }),
        post('/api/auth/refresh', { refreshToken: reg.refreshToken }),
      ])
      assert.deepEqual([r1.status, r2.status].sort(), [200, 401], '重放竞态：恰好一个 200')
    })

    it('B2 过期 refresh → 401 且二次也 401（消费即吊销——不可重放）', async () => {
      const email = uniqEmail()
      const reg = await (await post('/api/auth/register', { email, password: 'password123' })).json()
      await db.unsafe(
        `INSERT INTO _weifuwu_sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)`,
        [hashRefreshToken('expired-refresh-token'), reg.user.id, new Date(Date.now() - 60_000)],
      )
      const r1 = await post('/api/auth/refresh', { refreshToken: 'expired-refresh-token' })
      assert.equal(r1.status, 401)
      const r2 = await post('/api/auth/refresh', { refreshToken: 'expired-refresh-token' })
      assert.equal(r2.status, 401, '过期 token 被消费（吊销）后不可重放')
    })
  })

  describe('密码守卫（B5）', () => {
    it('密码 > 1024 → 400（register / setPassword / registerInApp 三端点）', async () => {
      const long = 'x'.repeat(1025)
      const r1 = await post('/api/auth/register', { email: uniqEmail(), password: long })
      assert.equal(r1.status, 400)
      const reg = await (await post('/api/auth/register', { email: uniqEmail(), password: 'password123' })).json()
      const ctx = await authCtx(reg.token)
      await assert.rejects(() => ctx.auth.setPassword(reg.user.id, long), (e: any) => e.status === 400)
      // registerInApp（开自助注册的应用）
      const ownerReg = await (await post('/api/auth/register', { email: uniqEmail(), password: 'password123' })).json()
      const appRes = await post('/api/auth/apps', { slug: `lp-${randomUUID()}`, name: 'A', openRegistration: true }, ownerReg.token)
      const { app } = await appRes.json()
      const r3 = await post(`/api/auth/apps/${app.slug}/register`, { email: uniqEmail(), password: long })
      assert.equal(r3.status, 400)
    })

    it('B5.2 register 自赋 role 被忽略（入库 null——授权走成员表）', async () => {
      const email = uniqEmail()
      const res = await post('/api/auth/register', { email, password: 'password123', role: 'admin' })
      assert.equal(res.status, 201)
      const data = await res.json()
      assert.equal(data.user.role, null, '响应面：自赋 role 不入库')
      const rows = await db.unsafe('SELECT role FROM _weifuwu_users WHERE email = $1', [email])
      assert.equal(rows[0].role, null, 'DB 面：role 恒 null')
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

// ── SSO 登录（G14：无密码建号/加成员——OIDC 集成用） ──

describe('ssoLogin（无密码 SSO 会话）', () => {
  const db = createMemorySql()
  const ssoUsers = userSystem({ sql: db, secret: 'test-secret-0123456789abcdef' })
  before(async () => { await ssoUsers.migrate() })
  after(async () => { await db.close() })
  async function ssoCtx(token?: string) {
    const ctx: any = {}
    await ssoUsers(new Request('http://localhost/', {
      headers: token ? { authorization: `Bearer ${token}` } : {},
    }), ctx, async () => new Response('ok'))
    return ctx
  }

  it('新邮箱：建平台账号 + 签发会话（无密码）', async () => {
    const ctx = await ssoCtx()
    const sso = await ctx.auth.ssoLogin('sso-new@corp.test', { name: 'SSO 用户' })
    assert.ok(sso.token, '签发 token')
    assert.equal(sso.user.email, 'sso-new@corp.test')
    assert.equal(sso.user.name, 'SSO 用户')
    // 无密码账号——密码登录不应成功
    await assert.rejects(() => ctx.auth.login('sso-new@corp.test', 'whatever'), /password/i)
  })

  it('已有账号：直接登录不重建', async () => {
    const ctx = await ssoCtx()
    const reg = await ctx.auth.register({ email: 'exist@corp.test', password: 'password123', name: '已有' })
    const sso = await ctx.auth.ssoLogin('exist@corp.test')
    assert.equal(sso.user.id, reg.user.id, '复用同一平台账号')
  })

  it('B6 并发 ssoLogin 同 email → 均成功且同一账号（建号幂等——非 409）', async () => {
    const [a, b] = await Promise.all([ssoCtx(), ssoCtx()])
    const [r1, r2] = await Promise.all([
      a.auth.ssoLogin('race-sso@corp.test', { name: 'A' }),
      b.auth.ssoLogin('race-sso@corp.test', { name: 'B' }),
    ])
    assert.equal(r1.user.id, r2.user.id, '并发建号竞态：同一账号')
    assert.ok(r1.token, '两个请求都签发会话')
    assert.ok(r2.token)
  })
})
