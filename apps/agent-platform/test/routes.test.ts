/**
 * 路由测试 — 所有 API 端点（依赖真实数据库）
 *
 * 前置条件: docker compose up -d 确保 Postgres 运行
 */

import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Router, postgres, cors } from 'weifuwu'
import { registerAuthRoutes } from '../src/routes/auth.ts'
import { registerCompanyRoutes } from '../src/routes/companies.ts'
import { registerAgentRoutes } from '../src/routes/agents.ts'
import { registerDepartmentRoutes } from '../src/routes/departments.ts'
import { registerMessageRoutes } from '../src/routes/messages.ts'
import { registerKnowledgeRoutes } from '../src/routes/knowledge.ts'
import { ai } from '../src/middleware/ai.ts'
import { auth } from '../src/middleware/auth.ts'
import { tenant } from '../src/middleware/tenant.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))

// ── 测试基础设施 ───────────────────────────────────────

let pg: ReturnType<typeof postgres>
let app: Router
let testToken: string
let testTenantId: string
let testUserId: string
let testCompanyId: string
let testAgentId: string
let testDeptId: string

function json(res: Response) { return res.json() as any }

function req(method: string, path: string, body?: unknown, token?: string): Promise<Response> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`
  return app.handler()(
    new Request(`http://localhost${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    }),
    { params: {}, query: {} } as any,
  )
}

function authed(method: string, path: string, body?: unknown): Promise<Response> {
  return req(method, path, body, testToken)
}

before(async () => {
  // 初始化数据库
  pg = postgres()
  app = new Router()
  app.use(cors())
  app.use(pg)

  // 运行 schema
  const schemaPath = resolve(__dirname, '..', 'src', 'db', 'schema.sql')
  const schema = readFileSync(schemaPath, 'utf-8')

  await pg.sql.unsafe(`
    DROP TABLE IF EXISTS kb_chunks CASCADE;
    DROP TABLE IF EXISTS kb_documents CASCADE;
    DROP TABLE IF EXISTS messages CASCADE;
    DROP TABLE IF EXISTS department_members CASCADE;
    DROP TABLE IF EXISTS departments CASCADE;
    DROP TABLE IF EXISTS agents CASCADE;
    DROP TABLE IF EXISTS companies CASCADE;
    DROP TABLE IF EXISTS users CASCADE;
    DROP TABLE IF EXISTS tenants CASCADE;
    DROP TYPE IF EXISTS agent_type CASCADE;
  `)
  await pg.sql.unsafe(schema)

  // 注册路由
  app.use(ai())
  registerAuthRoutes(app)

  const protectedRoutes = new Router()
  protectedRoutes.use(auth({ secret: process.env.JWT_SECRET ?? 'test-secret' }))
  protectedRoutes.use(tenant())
  registerCompanyRoutes(protectedRoutes)
  registerAgentRoutes(protectedRoutes)
  registerDepartmentRoutes(protectedRoutes)
  registerMessageRoutes(protectedRoutes)
  registerKnowledgeRoutes(protectedRoutes)
  protectedRoutes.get('/api/auth/me', async (req: Request, ctx: any): Promise<Response> => {
    const [user] = await ctx.sql`SELECT id, email, name, role FROM users WHERE id = ${ctx.auth!.userId}`
    return Response.json({ user })
  })
  app.mount('/', protectedRoutes)

  // 注册测试用户
  const regRes = await req('POST', '/api/auth/register', {
    email: 'test_routes@test.com',
    password: 'pass123',
    name: 'Route Tester',
  })
  const regData = await regRes.json()
  testToken = regData.token

  const loginRes = await req('POST', '/api/auth/login', {
    email: 'test_routes@test.com',
    password: 'pass123',
  })
  const loginData = await loginRes.json()
  testUserId = loginData.user.id
  testTenantId = loginData.user.tenantId
})

after(async () => {
  await pg.close()
})

describe('Routes', () => {

  // ── Auth ────────────────────────────────────────────────

  describe('Auth Routes', () => {
    it('POST /api/auth/register — 成功注册', async () => {
      const res = await req('POST', '/api/auth/register', {
        email: 'new_user@test.com', password: 'pass456', name: 'New User',
      })
      assert.equal(res.status, 200)
      const data = await res.json()
      assert.ok(data.token)
      assert.equal(data.user.email, 'new_user@test.com')
    })

    it('POST /api/auth/register — 重复邮箱返回 409', async () => {
      const res = await req('POST', '/api/auth/register', {
        email: 'test_routes@test.com', password: 'pass123', name: 'Duplicate',
      })
      assert.equal(res.status, 409)
    })

    it('POST /api/auth/register — 缺少必填字段返回 400', async () => {
      const res = await req('POST', '/api/auth/register', { email: 'only@email.com' })
      assert.equal(res.status, 400)
    })

    it('POST /api/auth/login — 成功登录', async () => {
      const res = await req('POST', '/api/auth/login', {
        email: 'test_routes@test.com', password: 'pass123',
      })
      assert.equal(res.status, 200)
      const data = await res.json()
      assert.ok(data.token)
      assert.equal(data.user.email, 'test_routes@test.com')
    })

    it('POST /api/auth/login — 错误密码返回 401', async () => {
      const res = await req('POST', '/api/auth/login', {
        email: 'test_routes@test.com', password: 'wrong',
      })
      assert.equal(res.status, 401)
    })

    it('POST /api/auth/login — 不存在的用户返回 401', async () => {
      const res = await req('POST', '/api/auth/login', {
        email: 'noexist@test.com', password: 'pass123',
      })
      assert.equal(res.status, 401)
    })

    it('GET /api/auth/me — 获取当前用户', async () => {
      const res = await authed('GET', '/api/auth/me')
      assert.equal(res.status, 200)
      const data = await res.json()
      assert.equal(data.user.id, testUserId)
    })

    it('GET /api/auth/me — 无 token 返回 401', async () => {
      const res = await req('GET', '/api/auth/me')
      assert.equal(res.status, 401)
    })

    it('GET /api/auth/me — 无效 token 返回 401', async () => {
      const res = await req('GET', '/api/auth/me', undefined, 'bad.token.here')
      assert.equal(res.status, 401)
    })
  })

  // ── Companies ───────────────────────────────────────────

  describe('Company Routes', () => {
    it('POST /api/companies — 创建公司', async () => {
      const res = await authed('POST', '/api/companies', { name: '测试公司' })
      assert.equal(res.status, 201)
      const data = await res.json()
      assert.ok(data.company.id)
      assert.equal(data.company.name, '测试公司')
      testCompanyId = data.company.id
    })

    it('GET /api/companies — 获取公司列表', async () => {
      const res = await authed('GET', '/api/companies')
      assert.equal(res.status, 200)
      const data = await res.json()
      assert.ok(Array.isArray(data.companies))
      assert.ok(data.companies.length >= 1)
    })

    it('GET /api/companies/:id — 获取单个公司', async () => {
      const res = await authed('GET', `/api/companies/${testCompanyId}`)
      assert.equal(res.status, 200)
      const data = await res.json()
      assert.equal(data.company.id, testCompanyId)
    })

    it('GET /api/companies/:id — 不存在的公司返回 404', async () => {
      const res = await authed('GET', '/api/companies/00000000-0000-0000-0000-000000000000')
      assert.equal(res.status, 404)
    })

    it('PUT /api/companies/:id — 更新公司', async () => {
      const res = await authed('PUT', `/api/companies/${testCompanyId}`, { name: '更新后的公司' })
      assert.equal(res.status, 200)
      const data = await res.json()
      assert.equal(data.company.name, '更新后的公司')
    })

    it('DELETE /api/companies/:id — 删除公司', async () => {
      const createRes = await authed('POST', '/api/companies', { name: '待删除' })
      const { company } = await createRes.json()
      assert.ok(company.id)

      const delRes = await authed('DELETE', `/api/companies/${company.id}`)
      assert.equal(delRes.status, 200)
      const data = await delRes.json()
      assert.equal(data.success, true)
    })
  })

  // ── Agents ──────────────────────────────────────────────

  describe('Agent Routes', () => {
    it('POST /api/agents — 创建 AI Agent', async () => {
      const res = await authed('POST', '/api/agents', {
        type: 'ai', name: '测试 AI 助手', system_prompt: '你是一个测试助手', temperature: 0.7,
      })
      assert.equal(res.status, 201)
      const data = await res.json()
      assert.ok(data.agent.id)
      assert.equal(data.agent.type, 'ai')
      testAgentId = data.agent.id
    })

    it('POST /api/agents — 创建 User Agent', async () => {
      const res = await authed('POST', '/api/agents', {
        type: 'user', name: '测试用户', user_id: testUserId,
      })
      assert.equal(res.status, 201)
    })

    it('POST /api/agents — 创建 Webhook Agent', async () => {
      const res = await authed('POST', '/api/agents', {
        type: 'webhook', name: '测试 Webhook', webhook_url: 'https://example.com/hook',
      })
      assert.equal(res.status, 201)
    })

    it('POST /api/agents — 创建知识库 Agent', async () => {
      const res = await authed('POST', '/api/agents', {
        type: 'knowledge_base', name: '测试知识库', chunk_size: 300,
      })
      assert.equal(res.status, 201)
    })

    it('POST /api/agents — 无效 type 返回 400', async () => {
      const res = await authed('POST', '/api/agents', { type: 'invalid', name: 'Bad Agent' })
      assert.equal(res.status, 400)
    })

    it('GET /api/agents — 获取 Agent 列表', async () => {
      const res = await authed('GET', '/api/agents')
      assert.equal(res.status, 200)
      const data = await res.json()
      assert.ok(Array.isArray(data.agents))
      assert.ok(data.agents.length >= 4)
    })

    it('GET /api/agents?type=ai — 按类型筛选', async () => {
      const res = await authed('GET', '/api/agents?type=ai')
      assert.equal(res.status, 200)
      const data = await res.json()
      assert.ok(data.agents.every((a: any) => a.type === 'ai'))
    })

    it('GET /api/agents/:id — 获取单个 Agent', async () => {
      const res = await authed('GET', `/api/agents/${testAgentId}`)
      assert.equal(res.status, 200)
      const data = await res.json()
      assert.equal(data.agent.id, testAgentId)
    })

    it('PUT /api/agents/:id — 更新 Agent（验证字段更新）', async () => {
      const res = await authed('PUT', `/api/agents/${testAgentId}`, {
        name: '更新后的助手', temperature: 0.3, max_tokens: 4096,
      })
      assert.equal(res.status, 200)
      const data = await res.json()
      assert.equal(data.agent.name, '更新后的助手')

      const getRes = await authed('GET', `/api/agents/${testAgentId}`)
      const getData = await getRes.json()
      assert.equal(getData.agent.name, '更新后的助手')
      assert.equal(getData.agent.temperature, 0.3)
      assert.equal(getData.agent.max_tokens, 4096)
    })

    it('DELETE /api/agents/:id — 删除 Agent', async () => {
      const createRes = await authed('POST', '/api/agents', { type: 'ai', name: '待删除' })
      const { agent } = await createRes.json()
      const delRes = await authed('DELETE', `/api/agents/${agent.id}`)
      assert.equal(delRes.status, 200)
    })
  })

  // ── Departments ─────────────────────────────────────────

  describe('Department Routes', () => {
    it('POST /api/departments — 创建部门', async () => {
      const res = await authed('POST', '/api/departments', {
        company_id: testCompanyId, name: '测试部门', member_ids: [testAgentId],
      })
      assert.equal(res.status, 201)
      const data = await res.json()
      assert.ok(data.department.id)
      assert.equal(data.department.name, '测试部门')
      testDeptId = data.department.id
    })

    it('POST /api/departments — 无效的 company_id 返回 404', async () => {
      const res = await authed('POST', '/api/departments', {
        company_id: '00000000-0000-0000-0000-000000000000', name: '孤立部门',
      })
      assert.equal(res.status, 404)
    })

    it('GET /api/departments — 获取部门列表', async () => {
      const res = await authed('GET', '/api/departments')
      assert.equal(res.status, 200)
      const data = await res.json()
      assert.ok(Array.isArray(data.departments))
      assert.ok(data.departments.length >= 1)
    })

    it('GET /api/departments/:id — 获取部门详情（含成员）', async () => {
      const res = await authed('GET', `/api/departments/${testDeptId}`)
      assert.equal(res.status, 200)
      const data = await res.json()
      assert.equal(data.department.id, testDeptId)
      assert.ok(Array.isArray(data.members))
    })

    it('PUT /api/departments/:id — 更新部门', async () => {
      const res = await authed('PUT', `/api/departments/${testDeptId}`, { name: '更新后的部门' })
      assert.equal(res.status, 200)
    })

    it('POST /api/departments/:id/members — 添加成员', async () => {
      const agentsRes = await authed('GET', '/api/agents')
      const { agents } = await agentsRes.json()
      const otherAgent = agents.find((a: any) => a.id !== testAgentId)
      if (!otherAgent) return

      const res = await authed('POST', `/api/departments/${testDeptId}/members`, { agent_id: otherAgent.id, role: 'admin' })
      assert.equal(res.status, 200)
    })

    it('DELETE /api/departments/:id/members/:agentId — 移除成员', async () => {
      const agentsRes = await authed('GET', '/api/agents')
      const { agents } = await agentsRes.json()
      const otherAgent = agents.find((a: any) => a.id !== testAgentId)
      if (!otherAgent) return

      const res = await authed('DELETE', `/api/departments/${testDeptId}/members/${otherAgent.id}`)
      assert.equal(res.status, 200)
    })

    it('DELETE /api/departments/:id — 删除部门', async () => {
      const createRes = await authed('POST', '/api/departments', { company_id: testCompanyId, name: '待删除部门' })
      const { department } = await createRes.json()
      const delRes = await authed('DELETE', `/api/departments/${department.id}`)
      assert.equal(delRes.status, 200)
    })
  })

  // ── Messages ────────────────────────────────────────────

  describe('Message Routes', () => {
    let userAgentId: string

    before(async () => {
      // 删除所有已有的 user agent（避免 sender 查找歧义）
      const { sql } = pg
      await sql`DELETE FROM agents WHERE tenant_id = ${testTenantId} AND type = 'user'`

      const res = await authed('POST', '/api/agents', {
        type: 'user', name: '消息发送者', user_id: testUserId,
      })
      const data = await res.json()
      userAgentId = data.agent.id

      // 加入部门
      await authed('POST', `/api/departments/${testDeptId}/members`, { agent_id: userAgentId })
    })

    it('POST /api/departments/:id/messages — 发送消息', async () => {
      const res = await authed('POST', `/api/departments/${testDeptId}/messages`, { content: 'Hello, AI!', msg_type: 'text' })
      assert.equal(res.status, 201)
      const data = await res.json()
      assert.ok(data.message.id)
      assert.equal(data.message.content, 'Hello, AI!')
    })

    it('POST /api/departments/:id/messages — 空内容返回 400', async () => {
      const res = await authed('POST', `/api/departments/${testDeptId}/messages`, { content: '', msg_type: 'text' })
      assert.equal(res.status, 400)
    })

    it('GET /api/departments/:id/messages — 获取消息列表', async () => {
      const res = await authed('GET', `/api/departments/${testDeptId}/messages`)
      assert.equal(res.status, 200)
      const data = await res.json()
      assert.ok(Array.isArray(data.messages))
      assert.ok(data.messages.length >= 1)
    })

    it('GET /api/departments/:id/messages?limit=1 — 分页', async () => {
      const res = await authed('GET', `/api/departments/${testDeptId}/messages?limit=1`)
      assert.equal(res.status, 200)
      const data = await res.json()
      assert.ok(data.messages.length <= 1)
    })

    it('POST /api/messages/:id/approve — 审批 AI 草稿', async () => {
      const draftRes = await authed('POST', `/api/departments/${testDeptId}/messages`, { content: '待审批消息' })
      const { message } = await draftRes.json()

      const { sql } = pg
      await sql`UPDATE messages SET ai_draft = 'AI 生成的回复', ai_approved = NULL WHERE id = ${message.id}`

      const approveRes = await authed('POST', `/api/messages/${message.id}/approve`, { approved: true })
      assert.equal(approveRes.status, 200)

      const [updated] = await sql`SELECT content, ai_approved FROM messages WHERE id = ${message.id}`
      assert.equal(updated.ai_approved, true)
      assert.equal(updated.content, 'AI 生成的回复')
    })

    it('POST /api/messages/:id/approve — 拒绝 AI 草稿', async () => {
      const { sql } = pg
      const draftRes = await authed('POST', `/api/departments/${testDeptId}/messages`, { content: '待拒绝消息' })
      const { message } = await draftRes.json()
      await sql`UPDATE messages SET ai_draft = '不好的回复', ai_approved = NULL WHERE id = ${message.id}`

      const rejectRes = await authed('POST', `/api/messages/${message.id}/approve`, { approved: false })
      assert.equal(rejectRes.status, 200)

      const [updated] = await sql`SELECT ai_approved, ai_draft FROM messages WHERE id = ${message.id}`
      assert.equal(updated.ai_approved, false)
      assert.equal(updated.ai_draft, null)
    })
  })

  // ── Knowledge Base ─────────────────────────────────────

  describe('Knowledge Base Routes', () => {
    let kbAgentId: string

    before(async () => {
      const res = await authed('POST', '/api/agents', {
        type: 'knowledge_base', name: '测试知识库', chunk_size: 200, chunk_overlap: 20,
      })
      const data = await res.json()
      kbAgentId = data.agent.id
    })

    it('POST /api/agents/:id/knowledge — 上传文档', async () => {
      const res = await authed('POST', `/api/agents/${kbAgentId}/knowledge`, {
        filename: 'test.txt',
        content: '人工智能是计算机科学的一个重要分支。机器学习是人工智能的核心技术之一。深度学习是机器学习的一个子领域。',
      })
      assert.equal(res.status, 201)
      const data = await res.json()
      assert.ok(data.document.id)
      assert.equal(data.document.filename, 'test.txt')
      assert.ok(data.chunk_count > 0)
    })

    it('GET /api/agents/:id/knowledge — 获取文档列表', async () => {
      const res = await authed('GET', `/api/agents/${kbAgentId}/knowledge`)
      assert.equal(res.status, 200)
      const data = await res.json()
      assert.ok(Array.isArray(data.documents))
      assert.ok(data.documents.length >= 1)
    })

    it('POST /api/agents/:id/knowledge — 缺少必填字段返回 400', async () => {
      const res = await authed('POST', `/api/agents/${kbAgentId}/knowledge`, { filename: 'empty.txt' })
      assert.equal(res.status, 400)
    })

    it('POST /api/agents/:id/knowledge/search — 语义检索', async () => {
      const res = await authed('POST', `/api/agents/${kbAgentId}/knowledge/search`, { query: '人工智能', top_k: 3 })
      assert.equal(res.status, 200)
      const data = await res.json()
      assert.ok(Array.isArray(data.results))
    })

    it('POST /api/agents/:id/knowledge/search — 缺少 query 返回 400', async () => {
      const res = await authed('POST', `/api/agents/${kbAgentId}/knowledge/search`, {})
      assert.equal(res.status, 400)
    })

    it('DELETE /api/knowledge/:id — 删除文档', async () => {
      const docsRes = await authed('GET', `/api/agents/${kbAgentId}/knowledge`)
      const { documents } = await docsRes.json()
      if (documents.length === 0) return
      const delRes = await authed('DELETE', `/api/knowledge/${documents[0].id}`)
      assert.equal(delRes.status, 200)
    })

    it('非 knowledge_base agent 返回 404', async () => {
      const res = await authed('GET', `/api/agents/${testAgentId}/knowledge`)
      assert.equal(res.status, 404)
    })
  })

  // ── 租户隔离 ─────────────────────────────────────────

  describe('Tenant Isolation', () => {
    let otherToken: string

    before(async () => {
      const regRes = await req('POST', '/api/auth/register', {
        email: 'other_tenant@test.com', password: 'pass456', name: 'Other User', tenantSlug: 'other-tenant',
      })
      const regData = await regRes.json()
      otherToken = regData.token
    })

    it('不同租户看不到彼此的公司', async () => {
      const myRes = await authed('GET', '/api/companies')
      const { companies: myCompanies } = await myRes.json()
      assert.ok(myCompanies.length > 0)

      const otherRes = await req('GET', '/api/companies', undefined, otherToken)
      const { companies: otherCompanies } = await otherRes.json()
      assert.equal(otherCompanies.length, 0)
    })

    it('不同租户看不到彼此的 Agent', async () => {
      const otherRes = await req('GET', '/api/agents', undefined, otherToken)
      const { agents } = await otherRes.json()
      // 注册时自动创建 1 个 user 类型 Agent；看不到其他租户的 Agent
      assert.equal(agents.length, 1)
      assert.equal(agents[0].type, 'user')
    })

    it('跨租户访问返回 404', async () => {
      const res = await req('GET', `/api/agents/${testAgentId}`, undefined, otherToken)
      assert.equal(res.status, 404)
    })
  })

  // ── 路由保护 ─────────────────────────────────────────

  describe('Route Protection', () => {
    it('所有受保护路由都需要认证', async () => {
      const paths = ['/api/companies', '/api/agents', '/api/departments', '/api/auth/me']
      for (const path of paths) {
        const res = await req('GET', path)
        assert.equal(res.status, 401, `${path} 应该返回 401`)
      }
    })
  })
})
