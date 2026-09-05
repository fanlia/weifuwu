/**
 * W5 试点契约：平台 REST 面（restFromShape 第二消费者）
 *
 * 试点判据（诚实）：平台现有路由全是业务聚合（departments/agents list——
 * 成员计数/最近消息/token 统计）——分层纪律：业务 handler 手写——
 * 「纯 CRUD 表迁移」无替换对象（role_templates 表无路由消费：内存常量面）。
 * 试点 = 验证 restFromShape 在真实平台面（SHAPES/DDL/租户）可用：
 *   agents：租户 scope + webhook_secret hidden + 简单 CRUD
 *   role_templates：无租户列（全局表）全量 list
 * 推翻条件：平台出现纯 CRUD 新表 → rest 直接生成（不手写样板）。
 */
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { Router, postgres } from 'weifuwu'
import { AGENT_PLATFORM_SCHEMA } from '../src/db/tables.ts'
import type { AppCtx } from '../src/middleware/ctx.ts'

let pg: ReturnType<typeof postgres>
let handle: (req: Request, ctx: Partial<AppCtx>) => Promise<Response>

const A1 = 'a1000000-0000-4000-8000-000000000001'

function req(method: string, path: string, body?: unknown, appId = A1): Promise<Response> {
  return handle(new Request(`http://localhost${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  }), { params: {}, query: {}, appId, user: { id: 'u1' } } as never)
}

before(async () => {
  pg = postgres({ memory: true, tenant: { field: 'app_id', value: (c) => (c as { appId?: string })?.appId } })
  await pg.migrateModule('agent-platform', AGENT_PLATFORM_SCHEMA as never)
  const { SHAPES } = await import('../src/db/shapes.ts')
  pg.orm.table('agents', SHAPES.agents as never)
  pg.orm.table('role_templates', SHAPES.role_templates as never)

  const app = new Router()
  app.use(pg)
  // 试点挂载：agents（租户 scope + hidden）+ role_templates（全局无租户）
  pg.orm.rest(pg.orm.table('agents'), { hidden: ['webhook_secret'] }).mount(app as never, '/api/rest-agents')
  pg.orm.rest(pg.orm.table('role_templates')).mount(app as never, '/api/rest-role-templates')
  handle = app.handler()

  const base = pg.orm.table('agents') as never as { insert: (v: Record<string, unknown>[]) => { run: () => Promise<unknown> } }
  await base.insert([
    { app_id: A1, type: 'ai', name: 'agent-one', webhook_secret: 'SECRET-1' },
    { app_id: 'a2000000-0000-4000-8000-000000000002', type: 'ai', name: 'agent-two', webhook_secret: 'SECRET-2' },
  ]).run()
  const rt = pg.orm.table('role_templates') as never as { insert: (v: Record<string, unknown>[]) => { run: () => Promise<unknown> } }
  await rt.insert([
    { name: '开发助手', slug: 'developer', category: 'engineering' },
    { name: '智能客服', slug: 'customer-support', category: 'support' },
  ]).run()
})

after(async () => { await pg.close().catch(() => {}) })

describe('W5 平台 rest 试点（第二消费者）', () => {
  it('agents：list 租户 scope（app-1 只见 agent-one）', async () => {
    const res = await req('GET', '/api/rest-agents')
    assert.equal(res.status, 200)
    const body = await res.json() as { agents: Record<string, unknown>[]; total: number }
    assert.equal(body.agents.length, 1)
    assert.equal(body.total, 1)
    assert.equal(body.agents[0].name, 'agent-one')
  })

  it('agents：webhook_secret hidden 豁免（list/one 不含敏感列）', async () => {
    const list = await req('GET', '/api/rest-agents')
    const body = await list.json() as { agents: Record<string, unknown>[] }
    assert.ok(!('webhook_secret' in body.agents[0]), 'list 无 secret')
    const one = await req('GET', `/api/rest-agents/${String(body.agents[0].id)}`)
    assert.equal(one.status, 200)
    assert.ok(!('webhook_secret' in (await one.json() as Record<string, unknown>)), 'one 无 secret')
  })

  it('agents：POST 自动 app_id 注入 + 201（无需客户端传租户）', async () => {
    const res = await req('POST', '/api/rest-agents', { type: 'ai', name: 'agent-rest' })
    assert.equal(res.status, 201)
    const body = await res.json() as { id: string; name: string }
    assert.ok(body.id, 'f.pk 自动生成')
    assert.equal(body.name, 'agent-rest')
    // 回读（同租户可见——新行归属 app-1）
    const list = await req('GET', '/api/rest-agents')
    const lb = await list.json() as { agents: { name: string }[] }
    assert.ok(lb.agents.some((a) => a.name === 'agent-rest'))
    // 跨租户隔离
    const other = await req('GET', '/api/rest-agents', undefined, 'a2000000-0000-4000-8000-000000000002')
    const ob = await other.json() as { agents: { name: string }[] }
    assert.ok(!ob.agents.some((a) => a.name === 'agent-rest'), 'app-2 不可见')
  })

  it('role_templates：无租户列（全局表）——全量 list 可用', async () => {
    const res = await req('GET', '/api/rest-role-templates')
    assert.equal(res.status, 200)
    const body = await res.json() as { role_templates: unknown[] }
    assert.equal(body.role_templates.length, 2, '全量（无 scope）')
  })
})
