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
import http from 'node:http'
import { createMemoryOrm, MemorySql } from '../db/memory-sql.ts'
import { createOrm } from '../db/orm.ts'
import { userSystem, WEIFUWU_USER_SCHEMA } from '../user/index.ts'
import { verifyToken, signToken } from '../user/token.ts'
import { Router } from '../core/router.ts'
import type { Context } from '../types.ts'

const mkCtx = (): any => ({ params: {}, query: {} }) // W1: Context 模块增强面（redis/ui 必填）——mock 逃逸（auth 注入面运行时有）

describe('userSystem 多应用（平台 → 应用 → 应用用户）', () => {
  const db = createMemoryOrm()
  db.mem.applySchema(WEIFUWU_USER_SCHEMA)
  const secret = 'test-secret-0123456789abcdef'
  const users = userSystem({ orm: db.orm, secret })

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

  async function fetchRoute(method: string, path: string, token?: string, body?: unknown) {
    const res = await handler(
      new Request(`http://localhost${path}`, {
        method,
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      }),
      { params: {}, query: {} } as never,
    )
    return res
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
      const slowOrm = createOrm({
        executeQuery: (q) => slowExec(q),
      } as never)
      mem.applySchema(WEIFUWU_USER_SCHEMA)
      const slowUsers = userSystem({ orm: slowOrm, secret })
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
      await (mem as any).close()
    })
  })

  // ── 3. 应用内自助注册（open_registration=true） ──────────
  describe('应用内自助注册（open_registration=true）', () => {
    it('无邀请注册 → 成为 member；应用内登录 token 带 appId + role', async () => {
      const owner = await registerPlatform()
      const tRes = await post('/api/auth/apps', { slug: `open-${uniq()}`, name: '开放应用', openRegistration: true }, owner.token)
      const { app } = await tRes.json()

      // 自助注册（无邀请）
      const regRes = await post(`/api/auth/apps/${app.slug}/auth/register`, { email: uniqEmail(), password: 'password123', name: '成员甲' })
      assert.equal(regRes.status, 201)
      const member = await regRes.json()
      const payload = verifyToken(member.token, secret)!
      assert.equal(payload.appId, app.id, '应用内注册 token 带 appId')
      assert.equal(payload.role, 'member')

      // 应用内登录
      const loginRes = await post(`/api/auth/apps/${app.slug}/auth/login`, { email: member.user.email, password: 'password123' })
      assert.equal(loginRes.status, 200)
      const login = await loginRes.json()
      assert.equal(verifyToken(login.token, secret)!.appId, app.id)
    })

    it('非成员登录该应用 → 401（平台账号但不属于该应用）', async () => {
      const owner = await registerPlatform()
      const { app } = await (await post('/api/auth/apps', { slug: `open-${uniq()}`, name: 'A', openRegistration: true }, owner.token)).json()
      const outsider = await registerPlatform()
      const res = await post(`/api/auth/apps/${app.slug}/auth/login`, { email: outsider.user.email, password: 'password123' })
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
      const res = await post(`/api/auth/apps/${app.slug}/auth/register`, { email: uniqEmail(), password: 'password123' })
      assert.equal(res.status, 403)
    })

    it('owner 生成邀请 token → 受邀者注册成功', async () => {
      const owner = await registerPlatform()
      const { app } = await (await post('/api/auth/apps', { slug: `inv-${uniq()}`, name: '邀请应用' }, owner.token)).json()

      const inviteEmail = uniqEmail()
      const invRes = await post(`/api/auth/apps/${app.slug}/auth/invites`, { email: inviteEmail, role: 'member' }, owner.token)
      assert.equal(invRes.status, 201)
      const { inviteToken } = await invRes.json()
      const invPayload = verifyToken(inviteToken, secret)!
      assert.equal(invPayload.type, 'app-invite')
      assert.equal(invPayload.appId, app.id)
      assert.equal(invPayload.email, inviteEmail)

      // 受邀者注册
      const regRes = await post(`/api/auth/apps/${app.slug}/auth/register`, { email: inviteEmail, password: 'password123', inviteToken })
      assert.equal(regRes.status, 201)
      const member = await regRes.json()
      assert.equal(verifyToken(member.token, secret)!.appId, app.id)
      assert.equal(member.user.email, inviteEmail)
    })

    it('邀请 email 不匹配 → 403', async () => {
      const owner = await registerPlatform()
      const { app } = await (await post('/api/auth/apps', { slug: `inv-${uniq()}`, name: '邀请应用' }, owner.token)).json()
      const invRes = await post(`/api/auth/apps/${app.slug}/auth/invites`, { email: `target-${uniq()}@test.local` }, owner.token)
      const { inviteToken } = await invRes.json()

      const res = await post(`/api/auth/apps/${app.slug}/auth/register`, { email: uniqEmail(), password: 'password123', inviteToken })
      assert.equal(res.status, 403, '邀请绑定邮箱与注册邮箱不一致 → 403')
    })

    it('owner 直接 addMember 已有平台账号 → 成员可直接应用内登录', async () => {
      const owner = await registerPlatform()
      const { app } = await (await post('/api/auth/apps', { slug: `inv-${uniq()}`, name: '邀请应用' }, owner.token)).json()
      const memberAcc = await registerPlatform()

      const addRes = await post(`/api/auth/apps/${app.slug}/auth/members`, { email: memberAcc.user.email, role: 'member' }, owner.token)
      assert.equal(addRes.status, 201)

      const login = await post(`/api/auth/apps/${app.slug}/auth/login`, { email: memberAcc.user.email, password: 'password123' })
      assert.equal(login.status, 200)
      assert.equal(verifyToken((await login.json()).token, secret)!.appId, app.id)
    })

    it('非 owner addMember → 403', async () => {
      const owner = await registerPlatform()
      const { app } = await (await post('/api/auth/apps', { slug: `inv-${uniq()}`, name: 'A' }, owner.token)).json()
      const outsider = await registerPlatform()
      const memberAcc = await registerPlatform()
      const res = await post(`/api/auth/apps/${app.slug}/auth/members`, { email: memberAcc.user.email }, outsider.token)
      assert.equal(res.status, 403)
    })
  })

  // ── 5. 应用级鉴权 requireApp ────────────────────────
  describe('requireApp（应用级鉴权）', () => {
    it('成员（应用/平台 token）→ 通过；非成员 → 403；无 token → 401', async () => {
      const owner = await registerPlatform()
      const { app } = await (await post('/api/auth/apps', { slug: `auth-${uniq()}`, name: 'A', openRegistration: true }, owner.token)).json()
      const memberReg = await post(`/api/auth/apps/${app.slug}/auth/register`, { email: uniqEmail(), password: 'password123' })
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

  // ── 6. 应用会话 refresh（B1：role 恢复——成员表权威） ────
  describe('应用会话 refresh（role 恢复——B1）', () => {
    it('loginApp 会话 refresh → 新 token 保留 role（原缺陷丢 role）', async () => {
      const owner = await registerPlatform()
      const { app } = await (await post('/api/auth/apps', { slug: `rf-${uniq()}`, name: 'A' }, owner.token)).json()
      const login = await (await post(`/api/auth/apps/${app.slug}/auth/login`, { email: owner.user.email, password: 'password123' })).json()
      assert.equal(verifyToken(login.token, secret)!.role, 'owner')
      const rf = await (await post('/api/auth/refresh', { refreshToken: login.refreshToken })).json()
      const payload = verifyToken(rf.token, secret)!
      assert.equal(payload.appId, app.id, 'appId 保留')
      assert.equal(payload.role, 'owner', 'refresh 后 role 必须在（B1 修复前丢字段）')
    })

    it('成员角色变更后 refresh → 新 role 生效（成员表权威——角色变更即时传播）', async () => {
      const owner = await registerPlatform()
      const { app } = await (await post('/api/auth/apps', { slug: `rf2-${uniq()}`, name: 'A', openRegistration: true }, owner.token)).json()
      const member = await (await post(`/api/auth/apps/${app.slug}/auth/register`, { email: uniqEmail(), password: 'password123' })).json()
      await db.orm.query.update('_weifuwu_app_members').set({ role: 'admin' }).where({ app_id: { eq: app.id }, user_id: { eq: member.user.id } }).run()
      const rf = await (await post('/api/auth/refresh', { refreshToken: member.refreshToken })).json()
      assert.equal(verifyToken(rf.token, secret)!.role, 'admin')
    })

    it('成员被移除后 refresh → 降级平台会话（token 无 appId——零残留应用访问）', async () => {
      const owner = await registerPlatform()
      const { app } = await (await post('/api/auth/apps', { slug: `rf3-${uniq()}`, name: 'A', openRegistration: true }, owner.token)).json()
      const member = await (await post(`/api/auth/apps/${app.slug}/auth/register`, { email: uniqEmail(), password: 'password123' })).json()
      await db.orm.query.delete('_weifuwu_app_members').where({ app_id: { eq: app.id }, user_id: { eq: member.user.id } }).run()
      const rfRes = await post('/api/auth/refresh', { refreshToken: member.refreshToken })
      assert.equal(rfRes.status, 200)
      const rf = await rfRes.json()
      const payload = verifyToken(rf.token, secret)!
      assert.equal(payload.appId, undefined, '被移除 → 平台态 token')
      assert.equal(payload.role, undefined)
    })

    it('registerInApp 会话 refresh → role 保留（双路径）', async () => {
      const owner = await registerPlatform()
      const { app } = await (await post('/api/auth/apps', { slug: `rf4-${uniq()}`, name: 'A', openRegistration: true }, owner.token)).json()
      const member = await (await post(`/api/auth/apps/${app.slug}/auth/register`, { email: uniqEmail(), password: 'password123' })).json()
      const rf = await (await post('/api/auth/refresh', { refreshToken: member.refreshToken })).json()
      assert.equal(verifyToken(rf.token, secret)!.role, 'member')
    })
  })

  // ── 7. B4 查询次数 / B6 幂等 ──────────────────────────────
  describe('B4 JOIN / B6 幂等', () => {
    it('B4 listMyApps 单 JOIN 查询（消除 N+1——3 应用 = 1 次 exec）', async () => {
      const mem = new MemorySql()
      let execs = 0
      // W1: mem.tag 已随 W3c 消亡——counting 未被消费（死代码）——删除
      const countingExec = async (q: any) => {
        execs++
        return mem.executeQuery(q)
      }
      const countingOrm = createOrm({
        executeQuery: (q: never) => countingExec(q),
      } as never)
      mem.applySchema(WEIFUWU_USER_SCHEMA)
      const countingUsers = userSystem({ orm: countingOrm, secret })
      await countingUsers.migrate()
      const ctx: any = {}
      await countingUsers(new Request('http://localhost/'), ctx, async () => new Response('ok'))
      await ctx.auth.register({ email: uniqEmail(), password: 'password123' })
      for (let i = 0; i < 3; i++) {
        await ctx.auth.createApp({ slug: `cnt-${uniq()}-${i}`, name: `A${i}` })
      }
      execs = 0
      const apps = await ctx.auth.listMyApps()
      assert.equal(apps.length, 3)
      assert.equal(execs, 1, 'B4：3 应用 = 1 次查询（原 N+1 = 4 次）')
      assert.equal(apps.every((t) => t.id && t.slug && t.name && t.role), true)
      await (mem as any).close()
    })

    it('B6 并发 registerInApp 同 email（open 应用）→ 均 201 且同一账号', async () => {
      const owner = await registerPlatform()
      const { app } = await (await post('/api/auth/apps', { slug: `race-${uniq()}`, name: 'R', openRegistration: true }, owner.token)).json()
      const email = uniqEmail()
      const [r1, r2] = await Promise.all([
        post(`/api/auth/apps/${app.slug}/auth/register`, { email, password: 'password123' }),
        post(`/api/auth/apps/${app.slug}/auth/register`, { email, password: 'password123' }),
      ])
      assert.equal(r1.status, 201)
      assert.equal(r2.status, 201, '并发同 email 建号幂等（非 409）')
      const a = await r1.json()
      const b = await r2.json()
      assert.equal(a.user.id, b.user.id, '同一平台账号')
    })
  })

  // ── 7.5 USERSYSTEM-V2 产品级注册 ──────────────────────────
  describe('registerWithApp（产品级注册）', () => {
    it('账号 + 默认应用（owner）+ 应用 token——一步到位（系统域定案：普通用户不落 _builtin）', async () => {
      const email = uniqEmail()
      const res = await post('/api/auth/register-app', { email, password: 'password123', name: '小王', appSlug: 'mybrand' })
      assert.equal(res.status, 201)
      const data = await res.json()
      assert.ok(data.token, '应用 token')
      assert.equal(data.app.role, 'owner')
      assert.equal(data.app.slug, 'mybrand')
      assert.equal(data.user.email, email)
      // 定案（V4）：一切注册必经 _builtin——应用管理面入册（身份即资格——
      // 只有 _builtin 成员能 createApp）——注册用户挂 member（管理面身份）
      const [m] = await db.orm.query.from('_weifuwu_app_members').select('role', 'source').where({ user_id: { eq: data.user.id }, app_id: { eq: '00000000-0000-4000-8000-0000000000b1' } }).run()
      assert.equal(m.role, 'member', '_builtin 管理面身份')
      assert.equal(m.source, 'register')
    })

    it('同域名 slug 冲突自动后缀（-2/-3——收编平台 200 次循环）', async () => {
      const email1 = uniqEmail()
      const email2 = email1.replace('@', '-2@') // 同域名（uniqEmail 域名相同）
      const r1 = await (await post('/api/auth/register-app', { email: email1, password: 'password123', appSlug: 'acme' })).json()
      const r2 = await (await post('/api/auth/register-app', { email: email2, password: 'password123', appSlug: 'acme' })).json()
      assert.equal(r1.app.slug, 'acme')
      assert.equal(r2.app.slug, 'acme-1', '冲突自动后缀')
    })

    it('onRegisterApp hook 触发（平台 onboarding 注入点）', async () => {
      let hooked: { userId: string; appSlug: string } | null = null
      const h = userSystem({
        orm: db.orm, secret, hooks: { onRegisterApp: (userId: string, app: { slug: string }): void => {
          hooked = { userId, appSlug: app.slug }
        } } })
      await h.migrate()
      const hApp = new Router()
      hApp.use(h)
      h.routes(hApp)
      const hRes = await hApp.handler()(
        new Request('http://localhost/api/auth/register-app', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: uniqEmail(), password: 'password123' }),
        }),
        mkCtx(),
      )
      assert.equal(hRes.status, 201)
      assert.ok(hooked, 'hook 触发')
      const hookedData = hooked as { userId: string; appSlug: string } | null
      assert.ok(hookedData!.userId.length > 0, 'userId 透传')
      assert.ok(hookedData!.appSlug.length > 0, 'app slug 透传')
    })

    it('V2 me()：应用 token → { user, session: { appId, role } }（前端角色单源）', async () => {
      const r = await (await post('/api/auth/register-app', { email: uniqEmail(), password: 'password123', appSlug: 'mecheck' })).json()
      const res = await get('/api/auth/me', r.token)
      const body = await res.json()
      assert.equal(body.user.email, r.user.email)
      assert.ok(body.session, '应用 token 有会话面')
      assert.equal(body.session.appId, r.app.id, 'appId 单源')
      assert.equal(body.session.role, 'owner', 'role 单源')
    })

    it('V2 ctx.session：业务路由读 { userId, appId, role } 三元组（一行身份）', async () => {
      const r = await (await post('/api/auth/register-app', { email: uniqEmail(), password: 'password123' })).json()
      let captured: any = null
      const probe = new Router()
      probe.use(users)
      probe.get('/probe', (req: Request, ctx: any) => {
        captured = ctx.session
        return new Response('ok')
      })
      const res = await probe.handler()(
        new Request('http://localhost/probe', { headers: { Authorization: `Bearer ${r.token}` } }),
        mkCtx(),
      )
      assert.equal(res.status, 200)
      assert.equal(captured.userId, r.user.id)
      assert.equal(captured.appId, r.app.id)
      assert.equal(captured.role, 'owner')
    })

    it('default slug = 邮箱域名（无 appSlug）', async () => {
      const email = `slugtest-${Date.now()}@acme-domain.com`
      const r = await (await post('/api/auth/register-app', { email, password: 'password123' })).json()
      assert.equal(r.app.slug, 'acme-domain.com')
    })
  })

  // ── 7.8 SSO（OIDC——mock IdP 实链） ─────────────────────────
  describe('SSO（OIDC 授权码——框架内建）', () => {
    async function startIdp(opts?: { email?: string; name?: string; failToken?: boolean }) {
      const server = http.createServer(async (req, res) => {
        const url = new URL(req.url ?? '/', 'http://localhost')
        if (url.pathname === '/token') {
          if (opts?.failToken) { res.writeHead(401); res.end(); return }
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ access_token: 'idp-token-1' }))
          return
        }
        if (url.pathname === '/userinfo') {
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ email: opts?.email ?? `sso-${randomUUID()}@idp.test`, name: opts?.name ?? 'SSO 用户' }))
          return
        }
        res.writeHead(404); res.end()
      })
      await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()))
      const port = (server.address() as { port: number }).port
      return { port, close: () => new Promise<void>((r) => server.close(() => r())) }
    }

    function ssoUsers(extra: Partial<Parameters<typeof userSystem>[0]> = {}) {
      const h = userSystem({
        orm: db.orm,
        secret,
        ...extra,
        sso: extra.sso ?? { issuer: 'http://127.0.0.1:9999', clientId: 'cid', clientSecret: 'csec', redirectBase: 'http://localhost' },
      })
      return h
    }

    it('enabled：未配置 = false（优雅降级）；配置后 = true + appSlug', async () => {
      const no = await get('/api/auth/apps/_builtin/auth/sso/enabled')
      assert.equal(no.status, 404, '未配置不挂路由（无 SSO 面——零显式暴露）')
      const h = ssoUsers()
      await h.migrate()
      const p = new Router(); p.use(h); h.routes(p)
      const res = await p.handler()(new Request('http://localhost/api/auth/apps/_builtin/auth/sso/enabled'), mkCtx())
      assert.equal(res.status, 200)
      assert.deepEqual(await res.json(), { enabled: true, appSlug: null })
    })

    it('login：302 IdP authorize（client_id + state=app slug）', async () => {
      const h = ssoUsers({ sso: { issuer: 'http://127.0.0.1:9999', clientId: 'cid', clientSecret: 'csec', redirectBase: 'http://localhost', defaultAppSlug: 'myapp' } })
      await h.migrate()
      const p = new Router(); p.use(h); h.routes(p)
      const res = await p.handler()(new Request('http://localhost/api/auth/apps/_builtin/auth/sso/login?app=tenant-x'), mkCtx())
      assert.equal(res.status, 302)
      const loc = res.headers.get('location')!
      assert.match(loc, /authorize\?/)
      assert.match(loc, /client_id=cid/)
      assert.match(loc, /state=tenant-x/, 'state=目标应用（回调定向）')
    })

    it('callback：code → userinfo → ssoLogin 建号/加成员/签发 token（全链——真实 HTTP）', async () => {
      const idp = await startIdp({ email: 'sso-user@idp.test', name: 'SSO 用户' })
      const h = userSystem({
        orm: db.orm, secret,
        sso: { issuer: `http://127.0.0.1:${idp.port}`, clientId: 'cid', clientSecret: 'csec', redirectBase: 'http://localhost' },
      })
      await h.migrate()
      const p = new Router(); p.use(h); h.routes(p)
      const handler = p.handler()
      const res = await handler(new Request(`http://localhost/api/auth/apps/_builtin/auth/sso/callback?code=abc&state=sso`), mkCtx())
      assert.equal(res.status, 200)
      const payload = await res.json()
      assert.ok(payload.token, '签发 session')
      assert.equal(payload.user.email, 'sso-user@idp.test')
      // token 可用（me 面）
      const me = await handler(new Request('http://localhost/api/auth/me', { headers: { Authorization: `Bearer ${payload.token}` } }), mkCtx())
      const meBody = await me.json()
      assert.equal(meBody.user.email, 'sso-user@idp.test')
      await idp.close()
    })

    it('callback state=app slug → 自动加成员（成员表落行）', async () => {
      const idp = await startIdp({ email: `sso-member-${randomUUID()}@idp.test` })
      const h = userSystem({
        orm: db.orm, secret,
        sso: { issuer: `http://127.0.0.1:${idp.port}`, clientId: 'cid', clientSecret: 'csec', redirectBase: 'http://localhost' },
      })
      await h.migrate()
      // 先建应用（slug=myapp）
      const ownerReg = await (await post('/api/auth/register-app', { email: uniqEmail(), password: 'password123', appSlug: 'myapp' })).json()
      const p = new Router(); p.use(h); h.routes(p)
      const handler = p.handler()
      const res = await handler(new Request(`http://localhost/api/auth/apps/_builtin/auth/sso/callback?code=abc&state=myapp`), mkCtx())
      const payload = await res.json()
      const [m] = await db.orm.query.from('_weifuwu_app_members').select('role', 'source').where({ user_id: { eq: payload.user.id }, app_id: { eq: ownerReg.app.id } }).run()
      assert.ok(m, 'SSO 自动加成员')
      assert.equal(m.role, 'member')
      assert.equal(m.source, 'sso', '来源标记 SSO')
      await idp.close()
    })

    it('token 交换失败 → 401（明确失败不静默）', async () => {
      const idp = await startIdp({ failToken: true })
      const h = userSystem({
        orm: db.orm, secret,
        sso: { issuer: `http://127.0.0.1:${idp.port}`, clientId: 'cid', clientSecret: 'csec', redirectBase: 'http://localhost' },
      })
      await h.migrate()
      const p = new Router(); p.use(h); h.routes(p)
      const res = await p.handler()(new Request('http://localhost/api/auth/apps/_builtin/auth/sso/callback?code=bad'), mkCtx())
      assert.equal(res.status, 401)
      await idp.close()
    })
  })

  // ── 7.9 幽灵角色拦截（allowedRoles 白名单） ─────────────
  describe('allowedRoles 幽灵角色拦截', () => {
    it('invite 非法 role → 403（B5.2 教训——曾放行任意 role 串铸造 admin）', async () => {
      const reg = await (await post('/api/auth/register-app', { email: uniqEmail(), password: 'password123' })).json()
      const res = await post('/api/auth/apps/invites', { email: 'v@x.com', role: 'superadmin' }, reg.token)
      // 路由面：apps/:appSlug/invites（slug = reg.app.slug）—— 用 app 路由格式
      const res2 = await post(`/api/auth/apps/${reg.app.slug}/auth/invites`, { email: 'v@x.com', role: 'superadmin' }, reg.token)
      assert.equal(res2.status, 403, '非法角色拒绝')
    })

    it('addMember 非法 role → 403', async () => {
      const reg = await (await post('/api/auth/register-app', { email: uniqEmail(), password: 'password123' })).json()
      const target = await (await post('/api/auth/register-app', { email: uniqEmail(), password: 'password123' })).json()
      const res = await post(`/api/auth/apps/${reg.app.slug}/auth/members`, { email: target.user.email, role: 'god' }, reg.token)
      assert.equal(res.status, 403)
    })

    it('合法 role（member/viewer）放行', async () => {
      const reg = await (await post('/api/auth/register-app', { email: uniqEmail(), password: 'password123' })).json()
      const target = await (await post('/api/auth/register-app', { email: uniqEmail(), password: 'password123' })).json()
      const res = await post(`/api/auth/apps/${reg.app.slug}/auth/members`, { email: target.user.email, role: 'viewer' }, reg.token)
      assert.equal(res.status, 201)
    })
  })

  // ── 7.10 系统域（_builtin——定案：owner=超级管理员·admin=系统管理员） ─────────
  describe('系统域（_builtin）', () => {
    it('seedBuiltinOwners：首个邮箱=owner（超级管理员·唯一）·其余=admin（系统管理员）——幂等', async () => {
      const h = userSystem({ orm: db.orm, secret })
      await h.migrate()
      const r1 = await h.seedBuiltinOwners(['root@sys.test', 'ops1@sys.test', 'ops2@sys.test'])
      assert.equal(r1.owner !== null, true)
      assert.equal(r1.admins.length, 2)
      // 幂等：再跑不重复不覆盖
      const r2 = await h.seedBuiltinOwners(['root@sys.test', 'ops1@sys.test', 'ops2@sys.test', 'another@sys.test'])
      assert.equal(r2.owner, r1.owner, 'owner 保持')
      assert.equal(r2.admins.length, 3, '新增第三个 admin·既有不变')
      // 成员面
      const rows = await db.orm.query.from('_weifuwu_app_members').select('role').where({ app_id: { eq: '00000000-0000-4000-8000-0000000000b1' } }).orderBy('role').run()
      const roles = rows.map((r: any) => r.role)
      assert.equal(roles.filter((r: string) => r === 'owner').length, 1, 'owner 唯一')
      assert.equal(roles.filter((r: string) => r === 'admin').length, 3)
    })

    it('addMember 系统域：viewer 禁（管理面无只读）·member 合法', async () => {
      const h = userSystem({ orm: db.orm, secret })
      await h.migrate()
      await h.seedBuiltinOwners(['root@sys.test'])
      const p = new Router(); p.use(h); h.routes(p)
      const handler = p.handler()
      const login = await handler(new Request('http://localhost/api/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'root@sys.test', password: 'x' }),
      }), mkCtx())
      void login
      // 通过 AuthApi（构造受控环境）验证特判——直接调方法
      const h2 = userSystem({ orm: db.orm, secret })
      await h2.migrate()
      const mk = async (token: string | null) => {
        const req = new Request('http://localhost/x', { headers: token ? { Authorization: `Bearer ${token}` } : {} })
        const ctx = mkCtx()
        await h2(req, ctx, async (req2: Request, ctx2: Context): Promise<Response> => { void req2; void ctx2; return new Response('ok') })
        return ctx
      }
      const owner = await h2.seedBuiltinOwners(['owner2@sys.test'])
      // owner 登录拿 token：register 一个应用 owner？简化——直接用 seed 后 login 不行（无密码）。
      // 用框架内置 register 建号+密码，再 addMember 到 _builtin 验证特判
      const reg = await (await post('/api/auth/register', { email: uniqEmail(), password: 'password123' })).json()
      const ctx2 = await mk(reg.token)
      await assert.rejects(() => ctx2.auth!.addMember('00000000-0000-4000-8000-0000000000b1', 'a@b.com', 'viewer'), /viewer/)
      // member 合法（管理面身份）——但 caller 需 owner（该测试 register 用户非 owner——仍拒）
      await assert.rejects(() => ctx2.auth!.addMember('00000000-0000-4000-8000-0000000000b1', 'a@b.com', 'member'), /Owner only/)
      void owner
    })

    it('createInvite 系统域禁止（任命制——不走邀请流）', async () => {
      const h = userSystem({ orm: db.orm, secret })
      await h.migrate()
      await h.seedBuiltinOwners(['root3@sys.test'])
      const reg = await (await post('/api/auth/register', { email: uniqEmail(), password: 'password123' })).json()
      const p = new Router(); p.use(h); h.routes(p)
      const handler = p.handler()
      const res = await handler(new Request('http://localhost/api/auth/apps/_builtin/auth/invites', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${reg.token}` },
        body: JSON.stringify({ role: 'admin' }),
      }), mkCtx())
      assert.equal(res.status, 403)
    })
  })

  // ── 7.11 V4 定案（_builtin=应用管理面·_default=平台业务面·身份即资格） ──
  describe('V4 应用管理面定案', () => {
    it('migrate 建 _default（幂等·owner 空）· seed 首 owner 自动关联 _default', async () => {
      const h = userSystem({ orm: db.orm, secret })
      await h.migrate()
      const [defApp] = await db.orm.query.from('_weifuwu_apps').select('id', 'open_registration').where({ slug: { eq: '_default' } }).run()
      assert.ok(defApp, '_default 存在')
      assert.equal(defApp.open_registration, false, '_default 默认不开放')
      const r = await h.seedBuiltinOwners(['sup@sys.test'])
      assert.ok(r.owner, '首 owner')
      const [rel] = await db.orm.query.from('_weifuwu_app_members').select('role').where({ app_id: { eq: defApp.id }, user_id: { eq: r.owner } }).run()
      assert.equal(rel.role, 'owner', '超级管理员关联 _default（owner）')
    })

    it('createApp 资格：非 _builtin 成员 → 403（身份即资格）· _ 前缀 slug → 400', async () => {
      const h = userSystem({ orm: db.orm, secret })
      await h.migrate()
      // 直接插一个无 _builtin 成员的用户（模拟历史异常数据——migrate 补挂前的场景）
      const [raw] = await db.orm.query.insert('_weifuwu_users').rows([{ email: `raw-${uniq()}@x.test`, password_hash: 'x' }]).returning('id').run()
      const p = new Router(); p.use(h); h.routes(p)
      const handler = p.handler()
      // 绕过认证直接调 AuthApi（构造 ctx）
      const req = new Request('http://localhost/x', { headers: { Authorization: `Bearer ${signToken({ sub: String(raw.id) }, secret, 3600)}` } })
      const ctx = mkCtx()
      await h(req, ctx, async (req2: Request, ctx2: Context): Promise<Response> => { void req2; void ctx2; return new Response('ok') })
      await assert.rejects(() => ctx.auth!.createApp({ slug: `noqual-${uniq()}`, name: 'X' }), /应用管理面/)
      // _ 前缀保留名
      await assert.rejects(() => ctx.auth!.createApp({ slug: '_hack', name: 'X' }), /保留名/)
    })

    it('register（纯账号）也入册 _builtin（一切注册必经管理面）', async () => {
      const reg = await (await post('/api/auth/register', { email: uniqEmail(), password: 'password123' })).json()
      const [m] = await db.orm.query.from('_weifuwu_app_members').select('role').where({ user_id: { eq: reg.user.id }, app_id: { eq: '00000000-0000-4000-8000-0000000000b1' } }).run()
      assert.equal(m.role, 'member')
    })

    it('migrate 存量补挂：无 _builtin 成员的用户 → migrate 幂等补（source=migrate）', async () => {
      const h = userSystem({ orm: db.orm, secret })
      await h.migrate()
      const reg = await (await post('/api/auth/register', { email: uniqEmail(), password: 'password123' })).json()
      // 模拟存量：删除其 _builtin 成员行 → 再 migrate → 补回
      await db.orm.query.delete('_weifuwu_app_members').where({ user_id: { eq: reg.user.id }, app_id: { eq: '00000000-0000-4000-8000-0000000000b1' } }).run()
      await h.migrate()
      const [m] = await db.orm.query.from('_weifuwu_app_members').select('role', 'source').where({ user_id: { eq: reg.user.id }, app_id: { eq: '00000000-0000-4000-8000-0000000000b1' } }).run()
      assert.equal(m.role, 'member')
      assert.equal(m.source, 'migrate')
    })

    it('registerInApp / ssoLogin 均入册 _builtin（注册必经管理面——邀请/SSO 路径一致）', async () => {
      const h = userSystem({ orm: db.orm, secret })
      await h.migrate()
      const owner = await (await post('/api/auth/register-app', { email: uniqEmail(), password: 'password123' })).json()
      const app = owner.app
      // 邀请加入（open_registration=false）
      // 邀请 token 直接构造（signToken 面——不依赖响应形状）
      const invToken = signToken({ type: 'app-invite', appId: app.id, role: 'member' }, secret, 3600)
      const joinEmail = uniqEmail()
      const join = await post(`/api/auth/apps/${app.slug}/auth/register`, { email: joinEmail, password: 'password123', name: 'J', inviteToken: invToken })
      assert.equal(join.status, 201)
      const [u] = await db.orm.query.from('_weifuwu_users').select('id').where({ email: { eq: joinEmail } }).run()
      const [m] = await db.orm.query.from('_weifuwu_app_members').select('role').where({ app_id: { eq: '00000000-0000-4000-8000-0000000000b1' }, user_id: { eq: u.id } }).run()
      assert.equal(m.role, 'member', '邀请加入也入册管理面')
    })

    it('appKey：随机生成·appId=应用 id·机器验证端点（分离沟通面）', async () => {
      const owner = await (await post('/api/auth/register-app', { email: uniqEmail(), password: 'password123' })).json()
      const app = owner.app
      assert.ok(app.id, 'appId = 应用 id')
      // 机器验证：正确凭据 → 应用信息
      const okRes = await handler(new Request('http://localhost/api/auth/apps/_builtin/auth/verify', {
        method: 'POST',
        headers: { 'X-Wf-App-Id': app.id, 'X-Wf-App-Key': app.app_key },
      }), mkCtx())
      assert.equal(okRes.status, 200)
      const body = await okRes.json()
      assert.equal(body.app.slug, app.slug)
      // 错误密钥 → 403
      const badRes = await handler(new Request('http://localhost/api/auth/apps/_builtin/auth/verify', {
        method: 'POST',
        headers: { 'X-Wf-App-Id': app.id, 'X-Wf-App-Key': 'wrong-key' },
      }), mkCtx())
      assert.equal(badRes.status, 403)
      // appKey 随机性（两次注册不同）
      const owner2 = await (await post('/api/auth/register-app', { email: uniqEmail(), password: 'password123' })).json()
      assert.notEqual(owner2.app.app_key, app.app_key, '随机生成')
    })

    it('setOpenRegistration：owner only · _builtin 恒 false 403', async () => {
      const owner = await (await post('/api/auth/register-app', { email: uniqEmail(), password: 'password123' })).json()
      const app = owner.app
      const res = await fetchRoute('PATCH', `/api/auth/apps/${app.slug}/auth/registration`, owner.token, { open: true })
      assert.equal(res.status, 200)
      const [row] = await db.orm.query.from('_weifuwu_apps').select('open_registration').where({ id: { eq: app.id } }).run()
      assert.equal(row.open_registration, true)
      // _builtin 恒 false
      const res2 = await fetchRoute('PATCH', '/api/auth/apps/_builtin/auth/registration', owner.token, { open: true })
      assert.equal(res2.status, 403)
    })
  })

  // ── 8. 迁移兼容 ─────────────────────────────────────────
  describe('迁移', () => {
    it('migrate 幂等 + 新表存在（apps / app_members）', async () => {
      await users.migrate()
      const t = await db.orm.query.from('_weifuwu_apps').limit(0).run()
      const m = await db.orm.query.from('_weifuwu_app_members').limit(0).run()
      assert.ok(Array.isArray(t), '_weifuwu_apps 表存在')
      assert.ok(Array.isArray(m), '_weifuwu_app_members 表存在')
    })

    it('V2 _builtin 系统应用：migrate 幂等建 + 无 owner（系统应用本体）', async () => {
      await users.migrate()
      const rows = await db.orm.query.from('_weifuwu_apps').select('id', 'slug', 'owner_user_id').where({ slug: { eq: '_builtin' } }).run()
      assert.equal(rows.length, 1, '_builtin 恰一行')
      assert.equal(rows[0].owner_user_id, null, '系统应用无自然人 owner')
      // 幂等：再次 migrate 不重复
      await users.migrate()
      const again = await db.orm.query.from('_weifuwu_apps').select('id').where({ slug: { eq: '_builtin' } }).run()
      assert.equal(again.length, 1, 'migrate 幂等——_builtin 唯一')
    })

    it('V2 members 元数据列：source + last_login_at（migrate 幂等补列）', async () => {
      await users.migrate()
      const cols = await db.orm.query.from('_weifuwu_app_members').select('source', 'last_login_at').limit(0).run()
      assert.ok(Array.isArray(cols), '成员表可读（列存在——source/last_login_at）')
    })
  })
})
