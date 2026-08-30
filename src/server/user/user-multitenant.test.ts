/**
 * userSystem 多应用扩展 — 平台 → 应用（app）→ 应用用户 三层模型测试
 *
 * 用户决策（2026-12）：
 *   1. 平台注册（email 全局唯一）→ 平台账号
 *   2. createApp 建应用 → 调用者成为 owner
 *   3. 应用内注册：自助/邀请两种机制，app 可配置（open_registration 开关）
 *   4. 两个登录入口：平台登录（/auth/login，token 无 appId + 应用列表）、
 *      应用内登录（/apps/:appId/auth/login，token 带 appId + role）
 *
 * 覆盖：平台注册 / createApp / 自助注册 / 邀请注册 / 平台登录 /
 *      应用内登录 / 应用级鉴权 requireApp / addMember / createInvite / listMyApps。
 */
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { createMemorySql, MemorySql } from '../db/memory-sql.ts'
import { createQueryBuilder } from '../db/query-builder.ts'
import { userSystem } from '../user/index.ts'
import { verifyToken } from '../user/token.ts'
import { Router } from '../core/router.ts'

const mkCtx = () => ({ params: {}, query: {} })

describe('userSystem 多应用（平台 → 应用 → 应用用户）', () => {
  const db = createMemorySql()
  const secret = 'test-secret-0123456789abcdef'
  const users = userSystem({ sql: db, secret })

  const app = new Router()
  app.use(users)
  users.routes(app)
  const handler = app.handler()

  before(async () => {
    await users.migrate()
  })

  after(async () => {
    await db.close()
  })

  const uniq = (prefix = 'u') => `${prefix}-${randomUUID()}`
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

  /** 注册平台账号 + 返回 { token, refreshToken, user } */
  async function registerPlatform(email?: string) {
    const res = await post('/api/auth/register', { email: email ?? uniqEmail(), password: 'password123', name: '测试用户' })
    assert.equal(res.status, 201)
    return res.json()
  }

  /** 建应用 + 返回 { app } */
  async function createApp(token: string, slug?: string, openRegistration = false) {
    const res = await post('/api/auth/apps', { slug: slug ?? `app-${uniq()}`, name: '测试应用', openRegistration })
    return res.json()
  }

  // ── 1. 平台注册 ──────────────────────────────────────────
  describe('平台注册', () => {
    it('register → 平台账号；token payload 无 appId（平台态）', async () => {
      const data = await registerPlatform()
      assert.ok(data.token)
      const payload = verifyToken(data.token, secret)!
      assert.equal(payload.sub, data.user.id)
      assert.equal(payload.appId, undefined, '平台注册 token 不带 appId')
      assert.equal(data.user.tenant, null, '平台注册不绑定应用')
    })

    it('重复 email 全局唯一 → 409', async () => {
      const email = uniqEmail()
      await registerPlatform(email)
      const res = await post('/api/auth/register', { email, password: 'password123' })
      assert.equal(res.status, 409)
    })
  })

  // ── 2. createApp（建应用） ───────────────────────────
  describe('createApp', () => {
    it('建应用 → 调用者成为 owner 成员', async () => {
      const owner = await registerPlatform()
      const res = await post('/api/auth/apps', { slug: `app-${uniq()}`, name: '我的产品' }, owner.token)
      assert.equal(res.status, 201)
      const { app } = await res.json()
      assert.ok(app.id)
      assert.equal(app.slug.includes('app-'), true)
      assert.equal(app.open_registration, false, '默认关闭自助注册')

      // owner 的应用列表含它
      const list = await (await get('/api/auth/apps', owner.token)).json()
      assert.equal(list.apps.length, 1)
      assert.equal(list.apps[0].role, 'owner')
    })

    it('slug 唯一 → 重复 409', async () => {
      const owner = await registerPlatform()
      const slug = `dup-${uniq()}`
      await post('/api/auth/apps', { slug, name: 'A' }, owner.token)
      const res = await post('/api/auth/apps', { slug, name: 'B' }, owner.token)
      assert.equal(res.status, 409)
    })

    it('未登录建应用 → 401', async () => {
      const res = await post('/api/auth/apps', { slug: `app-${uniq()}`, name: 'X' })
      assert.equal(res.status, 401)
    })

    it('G12 并发注册竞态：register→createApp 链不受并发 register 覆盖（请求局部 currentUser）', async () => {
      // 原缺陷：currentUser 模块级——请求 A register 写入后挂起，请求 B register
      // 覆盖 → createApp 内部窗口（真库网络 IO）内读 cur → owner 成员记到别人
      // 头上 → 应用内 loginApp 401 "Not a member of this application"
      // （agent-platform roles.test 偶发实证——register 一步端点 =
      // register+createApp+loginApp 同请求链；内存库 IO 零窗口测不出——
      // 本测试用延迟执行器拉长 members insert 窗口——真库 IO 的确定性替身）
      const mem = new MemorySql()
      // apps insert 延迟 20ms = createApp 内部真库网络 IO 窗口的确定性替身：
      // members 的 values 对象（含 user_id: currentUser.id）在链式调用时**同步求值**
      // ——落在 apps-insert await 恢复后的同步段——窗口就是这段 await
      const delayTables = new Set(['_weifuwu_apps', '_weifuwu_app_members'])
      const slowExec = (q: any) =>
        new Promise((res) =>
          setTimeout(() => res((mem as any).executeQuery(q)), delayTables.has((q as any).table) ? 120 : 0),
        )
      const slow = (async (s: TemplateStringsArray, ...v: unknown[]) => mem.tag(s, v)) as any
      slow.query = createQueryBuilder(slow, slowExec as any)
      slow.unsafe = (s: string, p?: unknown[]) => (mem as any).unsafe(s, p)
      slow.close = () => (mem as any).close()
      const slowUsers = userSystem({ sql: slow, secret })
      await slowUsers.migrate()
      const slowHandler = (() => { const r = new Router(); r.use(slowUsers); slowUsers.routes(r); return r.handler() })()
      void slowHandler
      async function slowAuthCtx() {
        const ctx: any = {}
        await slowUsers(new Request('http://localhost/'), ctx, async () => new Response('ok'))
        return ctx
      }
      const ctxA = await slowAuthCtx()
      const ctxB = await slowAuthCtx()
      const slugB = `race-b-${uniq()}`

      // 确定性交错（非 Promise.all 碰运气）：
      //   1. await ctxB.register(emailB) ——B 完成（旧代码模块 cur=userB）
      //   2. pB = ctxB.createApp(slugB)  ——启动：insert apps **挂起 20ms**
      //      （延迟执行器 120ms——真库网络 IO 的替身；需 > hashPassword scrypt 耗时）
      //   3. await ctxA.register(emailA) ——窗口内完成：旧代码模块 cur 被覆盖
      //      为 userA；修复后写的是 ctxA 请求局部——互不可见
      //   4. await pB                    ——apps insert 恢复：members 的 values
      //      （user_id: currentUser.id）**此刻同步求值**——旧代码读 userA（错）
      //      → B loginApp 401；修复后：请求局部 cur=userB → loginApp 200 owner
      const emailA = uniqEmail()
      const emailB = uniqEmail()

      await ctxB.auth.register({ email: emailB, password: 'password123', name: 'B' })
      const pB = ctxB.auth.createApp({ slug: slugB, name: 'B的应用' })
      await ctxA.auth.register({ email: emailA, password: 'password123', name: 'A' })
      const appB = await pB
      assert.ok(appB.id, 'createApp 成功')

      // owner 成员必须记在 B 头上（旧代码记到 A —— B 无法登录自己的应用）
      const login = await ctxB.auth.loginApp(slugB, emailB, 'password123')
      assert.equal(login.user.email, emailB, 'B 能应用内登录（owner 成员归属正确）')
      assert.equal(login.role, 'owner', 'B 是 owner（非被覆盖成无角色）')
      await (slow as any).close()
    })
  })

  // ── 3. 应用内自助注册（open_registration=true） ──────────
  describe('应用内自助注册（open_registration=true）', () => {
    it('无邀请注册 → 成为 member；应用内登录 token 带 appId + role', async () => {
      const owner = await registerPlatform()
      const tRes = await post('/api/auth/apps', { slug: `open-${uniq()}`, name: '开放应用', openRegistration: true }, owner.token)
      const { app } = await tRes.json()

      // 自助注册（无邀请）
      const regRes = await post(`/api/auth/apps/${app.slug}/register`, { email: uniqEmail(), password: 'password123', name: '成员甲' })
      assert.equal(regRes.status, 201)
      const member = await regRes.json()
      const payload = verifyToken(member.token, secret)!
      assert.equal(payload.appId, app.id, '应用内注册 token 带 appId')
      assert.equal(payload.role, 'member')

      // 应用内登录
      const loginRes = await post(`/api/auth/apps/${app.slug}/login`, { email: member.user.email, password: 'password123' })
      assert.equal(loginRes.status, 200)
      const login = await loginRes.json()
      assert.equal(verifyToken(login.token, secret)!.appId, app.id)
    })

    it('非成员登录该应用 → 401（平台账号但不属于该应用）', async () => {
      const owner = await registerPlatform()
      const { app } = await (await post('/api/auth/apps', { slug: `open-${uniq()}`, name: 'A', openRegistration: true }, owner.token)).json()
      const outsider = await registerPlatform()
      const res = await post(`/api/auth/apps/${app.slug}/login`, { email: outsider.user.email, password: 'password123' })
      assert.equal(res.status, 401, '不属于该应用的平台用户登录应用 → 401')
    })

    it('平台登录 → token 无 appId + apps 列表', async () => {
      const email = uniqEmail()
      const reg = await registerPlatform(email)
      // 加入两个应用（建 2 个 + 自助注册 1 个）
      await post('/api/auth/apps', { slug: `m1-${uniq()}`, name: '应用一' }, reg.token)
      await post('/api/auth/apps', { slug: `m2-${uniq()}`, name: '应用二' }, reg.token)
      const { app } = await (await post('/api/auth/apps', { slug: `open-${uniq()}`, name: '开放三', openRegistration: true }, reg.token)).json()

      const login = await post('/api/auth/login', { email, password: 'password123' })
      const data = await login.json()
      assert.equal(verifyToken(data.token, secret)!.appId, undefined, '平台登录 token 无 appId')
      assert.ok(Array.isArray(data.apps))
      assert.equal(data.apps.length, 3, '我的应用列表：2 owner + 1 owner')
      assert.equal(data.apps.every((t: any) => t.id && t.slug && t.name && t.role), true)
    })
  })

  // ── 4. 应用内邀请注册（open_registration=false） ─────────
  describe('应用内邀请注册（open_registration=false）', () => {
    it('关闭自助注册：无邀请注册 → 403', async () => {
      const owner = await registerPlatform()
      const { app } = await (await post('/api/auth/apps', { slug: `inv-${uniq()}`, name: '邀请应用', openRegistration: false }, owner.token)).json()
      const res = await post(`/api/auth/apps/${app.slug}/register`, { email: uniqEmail(), password: 'password123' })
      assert.equal(res.status, 403)
    })

    it('owner 生成邀请 token → 受邀者注册成功', async () => {
      const owner = await registerPlatform()
      const { app } = await (await post('/api/auth/apps', { slug: `inv-${uniq()}`, name: '邀请应用' }, owner.token)).json()

      const inviteEmail = uniqEmail()
      const invRes = await post(`/api/auth/apps/${app.slug}/invites`, { email: inviteEmail, role: 'member' }, owner.token)
      assert.equal(invRes.status, 201)
      const { inviteToken } = await invRes.json()
      const invPayload = verifyToken(inviteToken, secret)!
      assert.equal(invPayload.type, 'app-invite')
      assert.equal(invPayload.appId, app.id)
      assert.equal(invPayload.email, inviteEmail)

      // 受邀者注册
      const regRes = await post(`/api/auth/apps/${app.slug}/register`, { email: inviteEmail, password: 'password123', inviteToken })
      assert.equal(regRes.status, 201)
      const member = await regRes.json()
      assert.equal(verifyToken(member.token, secret)!.appId, app.id)
      assert.equal(member.user.email, inviteEmail)
    })

    it('邀请 email 不匹配 → 403', async () => {
      const owner = await registerPlatform()
      const { app } = await (await post('/api/auth/apps', { slug: `inv-${uniq()}`, name: '邀请应用' }, owner.token)).json()
      const invRes = await post(`/api/auth/apps/${app.slug}/invites`, { email: `target-${uniq()}@test.local` }, owner.token)
      const { inviteToken } = await invRes.json()

      const res = await post(`/api/auth/apps/${app.slug}/register`, { email: uniqEmail(), password: 'password123', inviteToken })
      assert.equal(res.status, 403, '邀请绑定邮箱与注册邮箱不一致 → 403')
    })

    it('owner 直接 addMember 已有平台账号 → 成员可直接应用内登录', async () => {
      const owner = await registerPlatform()
      const { app } = await (await post('/api/auth/apps', { slug: `inv-${uniq()}`, name: '邀请应用' }, owner.token)).json()
      const memberAcc = await registerPlatform()

      const addRes = await post(`/api/auth/apps/${app.slug}/members`, { email: memberAcc.user.email, role: 'member' }, owner.token)
      assert.equal(addRes.status, 201)

      const login = await post(`/api/auth/apps/${app.slug}/login`, { email: memberAcc.user.email, password: 'password123' })
      assert.equal(login.status, 200)
      assert.equal(verifyToken((await login.json()).token, secret)!.appId, app.id)
    })

    it('非 owner addMember → 403', async () => {
      const owner = await registerPlatform()
      const { app } = await (await post('/api/auth/apps', { slug: `inv-${uniq()}`, name: 'A' }, owner.token)).json()
      const outsider = await registerPlatform()
      const memberAcc = await registerPlatform()
      const res = await post(`/api/auth/apps/${app.slug}/members`, { email: memberAcc.user.email }, outsider.token)
      assert.equal(res.status, 403)
    })
  })

  // ── 5. 应用级鉴权 requireApp ────────────────────────
  describe('requireApp（应用级鉴权）', () => {
    it('成员（应用/平台 token）→ 通过；非成员 → 403；无 token → 401', async () => {
      const owner = await registerPlatform()
      const { app } = await (await post('/api/auth/apps', { slug: `auth-${uniq()}`, name: 'A', openRegistration: true }, owner.token)).json()
      const memberReg = await post(`/api/auth/apps/${app.slug}/register`, { email: uniqEmail(), password: 'password123' })
      const member = await memberReg.json()
      const outsider = await registerPlatform()

      // 直接调中间件验证 ctx.auth.requireApp
      async function authCtx(token?: string) {
        const ctx: any = {}
        const req = new Request('http://localhost/', { headers: token ? { authorization: `Bearer ${token}` } : {} })
        await users(req, ctx, async () => new Response('ok'))
        return ctx
      }

      // 应用 token 成员 → 通过
      const mCtx = await authCtx(member.token)
      const membership = await mCtx.auth.requireApp(app.id)
      assert.equal(membership.userId, member.user.id)
      assert.equal(membership.role, 'member')

      // 平台 token + 成员（owner）→ 通过（requireApp 校验 members 关系，不看 token 平台/应用态）
      const oCtx = await authCtx(owner.token)
      const ownerMembership = await oCtx.auth.requireApp(app.id)
      assert.equal(ownerMembership.role, 'owner')

      // 非成员（平台账号不属于该应用）→ 403
      const oCtx2 = await authCtx(outsider.token)
      await assert.rejects(() => oCtx2.auth.requireApp(app.id), (e: any) => e.status === 403)

      // 无 token → 401
      const nCtx = await authCtx()
      await assert.rejects(() => nCtx.auth.requireApp(app.id), (e: any) => e.status === 401)
    })
  })

  // ── 6. 迁移兼容 ─────────────────────────────────────────
  describe('迁移', () => {
    it('migrate 幂等 + 新表存在（apps / app_members）', async () => {
      await users.migrate()
      const t = await db.unsafe('SELECT * FROM _weifuwu_apps LIMIT 0')
      const m = await db.unsafe('SELECT * FROM _weifuwu_app_members LIMIT 0')
      assert.ok(Array.isArray(t), '_weifuwu_apps 表存在')
      assert.ok(Array.isArray(m), '_weifuwu_app_members 表存在')
    })
  })
})
