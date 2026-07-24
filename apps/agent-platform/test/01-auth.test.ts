/**
 * Auth 路由测试
 */
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { Router, postgres, cors } from 'weifuwu'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

let pg: ReturnType<typeof postgres>
let handle: (req: Request, ctx: any) => Promise<Response>

function req(method: string, path: string, body?: unknown): Promise<Response> {
  return handle(
    new Request(`http://localhost${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    }),
    { params: {}, query: {} },
  )
}

before(async () => {
  pg = postgres({ max: 10, closeTimeout: 1 })
  const schema = readFileSync(resolve(__dirname, '..', 'src', 'db', 'schema.sql'), 'utf-8')
  await pg.sql.unsafe('DROP TABLE IF EXISTS webhook_logs, agent_logs, kb_chunks, kb_documents, messages, department_members, departments, agents, companies, users, tenants CASCADE')
  await pg.sql.unsafe('DROP TYPE IF EXISTS agent_type CASCADE')
  await pg.sql.unsafe(schema)

  const app = new Router()
  app.use(cors())
  app.use(pg)

  const { ai } = await import('../src/middleware/ai.ts')
  app.use(ai())

  const { registerAuthRoutes } = await import('../src/routes/auth.ts')
  registerAuthRoutes(app)

  const { auth } = await import('../src/middleware/auth.ts')
  const { tenant } = await import('../src/middleware/tenant.ts')
  const protectedRoutes = new Router()
  protectedRoutes.use(auth({ secret: process.env.JWT_SECRET ?? 'test' }))
  protectedRoutes.use(tenant())
  protectedRoutes.get('/api/auth/me', async (req: Request, ctx: any): Promise<Response> => {
    const [user] = await ctx.sql`SELECT id, email, name, role FROM users WHERE id = ${ctx.auth!.userId}`
    return Response.json({ user })
  })
  app.mount('/', protectedRoutes)

  handle = app.handler()
})

after(async () => {
  const t0 = Date.now()
  try { await pg.close() } catch (e: any) { process.stderr.write(`[close_err] ${e.message}
`) }
  process.stderr.write(`[close] ${Date.now() - t0}ms
`)
})

describe('Auth', () => {
  let token = ''

  it('POST /api/auth/register — 成功注册', async () => {
    const res = await req('POST', '/api/auth/register', { email: 'a@b.com', password: 'pass123', name: 'Alice' })
    assert.equal(res.status, 200)
    const data = await res.json()
    assert.ok(data.token)
    assert.equal(data.user.email, 'a@b.com')
    token = data.token
  })

  it('POST /api/auth/register — 重复邮箱返回 409', async () => {
    const res = await req('POST', '/api/auth/register', { email: 'a@b.com', password: 'pass456', name: 'Alice2' })
    assert.equal(res.status, 409)
  })

  it('POST /api/auth/register — 缺少必填字段返回 400', async () => {
    const res = await req('POST', '/api/auth/register', { email: 'only@email.com' })
    assert.equal(res.status, 400)
  })

  it('POST /api/auth/login — 成功登录', async () => {
    const res = await req('POST', '/api/auth/login', { email: 'a@b.com', password: 'pass123' })
    assert.equal(res.status, 200)
    const data = await res.json()
    assert.ok(data.token)
  })

  it('POST /api/auth/login — 错误密码返回 401', async () => {
    const res = await req('POST', '/api/auth/login', { email: 'a@b.com', password: 'wrong' })
    assert.equal(res.status, 401)
  })

  it('POST /api/auth/login — 不存在的用户返回 401', async () => {
    const res = await req('POST', '/api/auth/login', { email: 'no@exist.com', password: 'pass123' })
    assert.equal(res.status, 401)
  })

  it('GET /api/auth/me — 获取当前用户', async () => {
    const res = await handle(
      new Request('http://localhost/api/auth/me', { headers: { Authorization: `Bearer ${token}` } }),
      { params: {}, query: {} },
    )
    assert.equal(res.status, 200)
    const data = await res.json()
    assert.equal(data.user.email, 'a@b.com')
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
})
