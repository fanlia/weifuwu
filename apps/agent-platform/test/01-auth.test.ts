/**
 * Auth 路由测试 — 框架 user() 全量面（USERSYSTEM-V2）
 *
 * 与 server.ts 同构：register-app（产品级注册：账号+默认应用+app token）/
 * login / logout / refresh / me——自研 registerAuthRoutes 已删（auth.ts 移除）。
 */
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { Router, postgres, cors, redis, userSystem, rateLimit } from 'weifuwu'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

let pg: ReturnType<typeof postgres>
let rds: ReturnType<typeof redis>
let handle: (req: Request, ctx: any) => Promise<Response>

function req(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<Response> {
  return handle(
    new Request(`http://localhost${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', 'x-forwarded-for': 'auth-test', ...headers },
      body: body ? JSON.stringify(body) : undefined,
    }),
    { params: {}, query: {} },
  )
}

before(async () => {
  pg = postgres(process.env.TEST_DATABASE_URL ?? 'postgres://root:123456@localhost:5432/demo_auth_test', { max: 10, closeTimeout: 1 })
  const schema = readFileSync(resolve(__dirname, '..', 'src', 'db', 'schema.sql'), 'utf-8')
  await pg.sql.unsafe('DROP TABLE IF EXISTS _weifuwu_sessions, _weifuwu_users, _weifuwu_apps, _weifuwu_app_members CASCADE')
  await pg.sql.unsafe('DROP TABLE IF EXISTS webhook_conversations, webhook_logs, agent_logs, agent_skills, kb_chunks, kb_documents, role_templates, messages, department_members, departments, events, agents, companies, _weifuwu_app_members, _weifuwu_apps, _weifuwu_sessions, _weifuwu_users CASCADE')
  await pg.sql.unsafe('DROP TYPE IF EXISTS agent_type CASCADE')
  await pg.sql.unsafe(schema)

  const app = new Router()
  app.use(cors())
  app.use(pg)
  rds = redis()
  app.use(rds) // ctx.limit 的 redis store 需要
  app.use(rateLimit({ redis: (rds as any).redis, windowMs: 60_000, max: 100 })) // 与 server.ts 同构

  // 框架用户系统（与 server.ts 一致——orm 表绑定面）
  const users = userSystem({ orm: pg.orm, secret: process.env.JWT_SECRET ?? 'test-secret-0123456789' })
  await users.migrate()
  app.use(users)
  // USERSYSTEM-V2：全量框架路由（register-app 产品级注册）——自研 auth.ts 已删
  users.routes(app, { prefix: '/api/auth' })

  // 限流 key 清理（跨运行残留 + 跨测试累计）：本文件统一 IP 'auth-test'（/me 同键）
  const rdsPool = (rds as any).redis
  // 实际键名带 rl: 前缀（rateLimit 中间件内部前缀）——两种都清，防跨运行残留；
  // 'unknown' 键 = 无 x-forwarded-for 的裸 Request（历史 /me 写法——其他测试文件可能残留）
  for (const k of ['rl:rl:global:auth-test', 'rl:rl:register:auth-test', 'rl:global:auth-test', 'rl:register:auth-test', 'rl:rl:global:unknown']) {
    await rdsPool.del(k)
  }

  // 受保护路由（仅验证 requireAuth 保护语义；me 由框架 users.routes 提供）
  const protectedRoutes = new Router()
  protectedRoutes.use((req: Request, ctx: any, next: any) => {
    ctx.auth.requireAuth()
    return next(req, ctx)
  })
  protectedRoutes.get('/api/ping', async () => Response.json({ ok: true }))
  app.mount('/', protectedRoutes)

  handle = app.handler()
})

after(async () => {
  try { await pg.close() } catch { /* ignore */ }
  try { await (rds as any).close?.() } catch { /* ignore */ }
})

describe('Auth', () => {
  let token = ''

  it('POST /api/auth/register — 成功注册', async () => {
    const res = await req('POST', '/api/auth/register-app', { email: 'a@b.com', password: 'pass1234', name: 'Alice' })
    assert.ok(res.status === 200 || res.status === 201, `created 语义（实际 ${res.status}）`)
    const data = await res.json()
    assert.ok([200, 201].includes(res.status), `created 语义（实际 ${res.status}）`)
    assert.ok(data.token)
    assert.equal(data.user.email, 'a@b.com')
    token = data.token
  })

  it('POST /api/auth/register — 重复邮箱返回 409', async () => {
    const res = await req('POST', '/api/auth/register-app', { email: 'a@b.com', password: 'pass4567', name: 'Alice2' })
    assert.equal(res.status, 409)
  })

  it('POST /api/auth/register — 缺少必填字段返回 400', async () => {
    const res = await req('POST', '/api/auth/register-app', { email: 'only@email.com' })
    assert.equal(res.status, 400)
  })

  it('POST /api/auth/login — 成功登录', async () => {
    const res = await req('POST', '/api/auth/login', { email: 'a@b.com', password: 'pass1234' })
    assert.equal(res.status, 200)
    const data = await res.json()
    assert.ok(data.token)
  })

  it('POST /api/auth/login — 错误密码返回 401', async () => {
    const res = await req('POST', '/api/auth/login', { email: 'a@b.com', password: 'wrong123' })
    assert.equal(res.status, 401)
  })

  it('POST /api/auth/login — 不存在的用户返回 401', async () => {
    const res = await req('POST', '/api/auth/login', { email: 'no@exist.com', password: 'pass1234' })
    assert.equal(res.status, 401)
  })

  it('GET /api/auth/me — 获取当前用户', async () => {
    const res = await req('GET', '/api/auth/me', undefined, { Authorization: `Bearer ${token}` })
    assert.equal(res.status, 200)
    const data = await res.json()
    assert.equal(data.user.email, 'a@b.com', '框架 /api/auth/me 返回 { user, session }（V2 会话面）')
    assert.equal(data.session?.role, 'owner', 'register-app token → 会话带 app 角色')
  })

  it('GET /api/auth/me — 无 token 返回 401', async () => {
    const res = await req('GET', '/api/auth/me')
    assert.equal(res.status, 401)
  })

  it('GET /api/auth/me — 无效 token 返回 401', async () => {
    const res = await req('GET', '/api/auth/me', undefined, { Authorization: 'Bearer bad.token.here' })
    assert.equal(res.status, 401)
  })

  it('register-app：同域名多租户 slug 自动后缀（每注册 = 独立应用）', async () => {
    // 旧自建 auth.ts 的注册限流（ctx.limit('register')）已随 auth.ts 删除——
    // 防滥用职责移交 server.ts 全局 rateLimit（/api/ 前缀）。本用例锁新语义：
    // 同域名（acme.com）两次注册不撞 slug 唯一键（自动后缀 -1）。
    const r1 = await req('POST', '/api/auth/register-app', { email: 't1@acme.com', password: 'pass1234', name: 'T1' })
    assert.ok([200, 201].includes(r1.status), `首次注册（实际 ${r1.status}）`)
    const r2 = await req('POST', '/api/auth/register-app', { email: 't2@acme.com', password: 'pass1234', name: 'T2' })
    assert.ok([200, 201].includes(r2.status), `同域名二次注册（实际 ${r2.status}）`)
    const d1 = await r1.json()
    const d2 = await r2.json()
    assert.notEqual(d1.app.slug, d2.app.slug, 'slug 唯一（自动后缀）')
  })
})
