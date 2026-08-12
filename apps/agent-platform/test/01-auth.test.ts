/**
 * Auth 路由测试 — 基于框架 user()（_weifuwu_users）+ 自定义 register 租户流程
 *
 * 与 server.ts 同构：userSystem 提供 login/logout/refresh/me，
 * registerAuthRoutes 提供自定义 register（建租户 + 框架注册 + 默认 user Agent）。
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

function req(method: string, path: string, body?: unknown): Promise<Response> {
  return handle(
    new Request(`http://localhost${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', 'x-forwarded-for': 'auth-test' },
      body: body ? JSON.stringify(body) : undefined,
    }),
    { params: {}, query: {} },
  )
}

before(async () => {
  pg = postgres(process.env.TEST_DATABASE_URL ?? 'postgres://root:123456@localhost:5432/demo_test', { max: 10, closeTimeout: 1 })
  const schema = readFileSync(resolve(__dirname, '..', 'src', 'db', 'schema.sql'), 'utf-8')
  await pg.sql.unsafe('DROP TABLE IF EXISTS _weifuwu_sessions, _weifuwu_users CASCADE')
  await pg.sql.unsafe('DROP TABLE IF EXISTS webhook_logs, agent_logs, kb_chunks, kb_documents, messages, department_members, departments, agents, companies, tenants CASCADE')
  await pg.sql.unsafe('DROP TYPE IF EXISTS agent_type CASCADE')
  await pg.sql.unsafe(schema)

  const app = new Router()
  app.use(cors())
  app.use(pg)
  rds = redis()
  app.use(rds) // ctx.limit 的 redis store 需要
  app.use(rateLimit({ redis: (rds as any).redis, windowMs: 60_000, max: 100 })) // 与 server.ts 同构

  // 框架用户系统（与 server.ts 一致）
  const users = userSystem({ sql: pg.sql, secret: process.env.JWT_SECRET ?? 'test-secret-0123456789' })
  await users.migrate()
  app.use(users)
  users.routes(app, { prefix: '/api/auth', exclude: ['register'] })

  // 自定义注册路由（租户 + 框架注册 + 默认 Agent）
  const { registerAuthRoutes } = await import('../src/routes/auth.ts')
  registerAuthRoutes(app)

  // 限流 key 清理（跨运行残留 + 跨测试累计）：本文件统一 IP 'auth-test'
  const rdsPool = (rds as any).redis
  // 实际键名带 rl: 前缀（rateLimit 中间件内部前缀）——两种都清，防跨运行残留
  for (const k of ['rl:rl:global:auth-test', 'rl:rl:register:auth-test', 'rl:global:auth-test', 'rl:register:auth-test']) {
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
    const res = await req('POST', '/api/auth/register', { email: 'a@b.com', password: 'pass1234', name: 'Alice' })
    assert.equal(res.status, 200)
    const data = await res.json()
    assert.ok(data.token)
    assert.equal(data.user.email, 'a@b.com')
    token = data.token
  })

  it('POST /api/auth/register — 重复邮箱返回 409', async () => {
    const res = await req('POST', '/api/auth/register', { email: 'a@b.com', password: 'pass4567', name: 'Alice2' })
    assert.equal(res.status, 409)
  })

  it('POST /api/auth/register — 缺少必填字段返回 400', async () => {
    const res = await req('POST', '/api/auth/register', { email: 'only@email.com' })
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
    const res = await handle(
      new Request('http://localhost/api/auth/me', { headers: { Authorization: `Bearer ${token}` } }),
      { params: {}, query: {} },
    )
    assert.equal(res.status, 200)
    const data = await res.json()
    assert.equal(data.email, 'a@b.com', '框架 /api/auth/me 直接返回 ctx.user（无 {user} 包裹）')
  })

  it('GET /api/auth/me — 无 token 返回 401', async () => {
    const res = await handle(new Request('http://localhost/api/auth/me'), { params: {}, query: {} })
    assert.equal(res.status, 401)
  })

  it('GET /api/auth/me — 无效 token 返回 401', async () => {
    const res = await handle(
      new Request('http://localhost/api/auth/me', { headers: { Authorization: 'Bearer bad.token.here' } }),
      { params: {}, query: {} },
    )
    assert.equal(res.status, 401)
  })

  it('限流（框架 ctx.limit，IP 维度）：同一 IP 5 次注册后 429', async () => {
    // 清理该 IP 限流计数（ctx.limit key = rl:register:{ip}）
    // 实际键名带 rl: 前缀（rateLimit 内部前缀）——两候选都清
    await (rds as any).redis.command('DEL', 'rl:rl:register:test-ip')
    await (rds as any).redis.command('DEL', 'rl:register:test-ip')
    const reqWithIp = (body: unknown) =>
      handle(
        new Request('http://localhost/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-forwarded-for': 'test-ip' },
          body: JSON.stringify(body),
        }),
        { params: {}, query: {} },
      )
    // 5 次放行
    for (let i = 0; i < 5; i++) {
      const res = await reqWithIp({ email: `rl${i}@x.com`, password: 'pass1234', name: `R${i}` })
      assert.ok(res.status !== 429, `第 ${i + 1} 次应放行（实际 ${res.status}）`)
    }
    // 第 6 次 429
    const blocked = await reqWithIp({ email: 'rlx@x.com', password: 'pass1234', name: 'Rx' })
    assert.equal(blocked.status, 429)
    // 不同 IP 不受影响（独立维度）
    const otherIp = await handle(
      new Request('http://localhost/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-forwarded-for': 'other-ip' },
        body: JSON.stringify({ email: 'other@x.com', password: 'pass1234', name: 'Other' }),
      }),
      { params: {}, query: {} },
    )
    assert.ok(otherIp.status !== 429, '不同 IP 独立计数')
    // 清理
    // 实际键名带 rl: 前缀（rateLimit 内部前缀）——两候选都清
    await (rds as any).redis.command('DEL', 'rl:rl:register:test-ip')
    await (rds as any).redis.command('DEL', 'rl:register:test-ip')
    await (rds as any).redis.command('DEL', 'rl:register:other-ip')
  })
})
