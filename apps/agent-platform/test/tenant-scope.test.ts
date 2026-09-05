/**
 * W1 试点契约：平台 agents list 租户隔离（tenant 接线 + ctxTable 自动 scope）
 *
 * server.ts 已配置 tenant{ field:'app_id' }——ctx.orm 自动 CtxOrm——
 * agents list（试点 route）用 ctxTable——app-1 只见 app-1 的 agent。
 */
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { Router, postgres, userSystem } from 'weifuwu'
import { AGENT_PLATFORM_SCHEMA } from '../src/db/tables.ts'
import { registerAgentRoutes } from '../src/routes/agents.ts'
import type { AppCtx } from '../src/middleware/ctx.ts'

let pg: ReturnType<typeof postgres>
let handle: (req: Request, ctx: Partial<AppCtx>) => Promise<Response>

function req(appId: string, path: string): Promise<Response> {
  return handle(new Request(`http://localhost${path}`), { params: {}, query: {}, appId, user: { id: 'u1' } } as never)
}

const A1 = 'a1000000-0000-4000-8000-000000000001'
const A2 = 'a2000000-0000-4000-8000-000000000002'

before(async () => {
  pg = postgres({ memory: true, tenant: { field: 'app_id', value: (c) => (c as { appId?: string })?.appId } })
  await pg.migrateModule('agent-platform', AGENT_PLATFORM_SCHEMA as never)
  const app = new Router()
  app.use(pg)
  registerAgentRoutes(app)
  const orm = pg.orm
  // 播种：每个 agent 表列（insert 直插——app_id 显式——租户隔离断言面）
  const { SHAPES } = await import('../src/db/shapes.ts')
  orm.table('agents', SHAPES.agents as never)
  const base = orm.table('agents') as never as { insert: (v: Record<string, unknown>[]) => { run: () => Promise<unknown> } }
  await base.insert([
    { id: 'a0000000-0000-4000-8000-000000000001', app_id: 'a1000000-0000-4000-8000-000000000001', type: 'ai', name: 'agent-one' },
    { id: 'a0000000-0000-4000-8000-000000000002', app_id: 'a2000000-0000-4000-8000-000000000002', type: 'ai', name: 'agent-two' },
  ]).run()
  handle = app.handler()
})

after(async () => { await pg.close().catch(() => {}) })

describe('W1 租户 scope（agents list 试点）', () => {
  it('app-1 只见 app-1 的 agent（list 自动 scope——手写 app_id 过滤已删）', async () => {
    const res = await req(A1, '/api/agents')
    assert.equal(res.status, 200)
    // pk 列 insert 时不传显式 id（f.pk 自动生成）——断言数量+名字（租户隔离语义）
    const body = await res.json() as { agents: { id: string; name: string; app_id?: string }[] }
    assert.equal(body.agents.length, 1)
    assert.equal(body.agents[0].name, 'agent-one')
  })

  it('app-2 隔离（跨租户不可见）', async () => {
    const res = await req(A2, '/api/agents')
    const body = await res.json() as { agents: { name: string }[] }
    assert.equal(body.agents.length, 1)
    assert.equal(body.agents[0].name, 'agent-two')
  })
})
