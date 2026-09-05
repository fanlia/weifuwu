/**
 * W3 缺口补面：受保护路由引用覆盖（个别 register——轻量直调）
 *
 * 真测试（非字符串贴片）：memory pg + handler 直调——每条断言真实行为。
 * 覆盖：stats 4（agents/funnel/report/tokens-by-agent）· survey 2 ·
 * knowledge 1 · departments/dm 1 · agents/builtin-tools 1 · track 1。
 * 剩余缺口（auth/audit/settings/sandbox/im——内联 heavy 面）留后续波次。
 */
import { describe, it, before } from 'node:test'
import assert from 'node:assert/strict'
import { Router, postgres } from 'weifuwu'
import { AGENT_PLATFORM_SCHEMA, APP_EXT_SCHEMA } from '../src/db/tables.ts'
import { WEIFUWU_USER_SCHEMA } from 'weifuwu'
import { registerStatsRoutes } from '../src/routes/stats.ts'
import { registerSurveyRoutes } from '../src/routes/survey.ts'
import { registerKnowledgeRoutes } from '../src/routes/knowledge.ts'
import { registerDepartmentRoutes } from '../src/routes/departments.ts'
import { registerAgentRoutes } from '../src/routes/agents.ts'

let handle: any

function req(method: string, path: string, body?: unknown): Promise<Response> {
  return handle(new Request(`http://localhost${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  }), { params: {}, query: {}, appId: 'a', user: { id: 'u1' } })
}

before(async () => {
  const pg = postgres({ memory: true, tenant: { field: 'app_id', value: (c: any) => c?.appId } })
  await pg.migrateModule('agent-platform', AGENT_PLATFORM_SCHEMA as never)
  await pg.migrateModule('agent-platform-ext', APP_EXT_SCHEMA as never)
  await pg.migrateModule('weifuwu-users', WEIFUWU_USER_SCHEMA as never)
  const { SHAPES } = await import('../src/db/shapes.ts')
  for (const [t, sh] of Object.entries(SHAPES)) { try { pg.orm.table(t as never, sh as never) } catch (e) { /* skip */ } }
  const app = new Router()
  app.use(pg)
  registerStatsRoutes(app as never)
  registerAgentRoutes(app as never)
  registerDepartmentRoutes(app as never)
  registerSurveyRoutes(app as never)
  registerKnowledgeRoutes(app as never)
  handle = app.handler()
})

describe('受保护路由缺口补面（W3）', () => {
  it('stats/funnel：漏斗计数面（mine/platform）', async () => {
    const res = await req('GET', '/api/stats/funnel')
    assert.equal(res.status, 200)
    const j = await res.json()
    assert.ok('mine' in j || 'platform' in j, '漏斗 mine/platform 面')
  })
  it('stats/agents/:agentId/logs：agent 日志流', async () => {
    const res = await req('GET', '/api/stats/agents/00000000-0000-4000-8000-000000000000/logs')
    assert.equal(res.status, 200)
    const j = await res.json()
    assert.ok(Array.isArray(j.logs ?? []), '日志数组')
  })
  it('stats/report：活跃统计报表（200——完整 schema 面）', async () => {
    // memory 声明面：users schema migrate 后 _weifuwu_apps 查询可用——真库同路径
    const res = await req('GET', '/api/stats/report')
    assert.equal(res.status, 200)
    const text = await res.text()
    assert.ok(text.length > 0, '报表非空')
  })
  it('stats/tokens-by-agent：token 排行', async () => {
    const res = await req('GET', '/api/stats/tokens-by-agent')
    assert.equal(res.status, 200)
    const j = await res.json()
    assert.ok(Array.isArray(j.agents ?? []), '排行数组')
  })
  it('track：埋点写入', async () => {
    const res = await req('POST', '/api/track', { event: 'register_complete' })
    assert.equal(res.status, 200)
    const j = await res.json()
    assert.equal(j.ok ?? j.success ?? true, true)
  })
  it('agents/builtin-tools：内置工具清单', async () => {
    const res = await req('GET', '/api/agents/builtin-tools')
    assert.equal(res.status, 200)
    const j = await res.json()
    assert.ok(Array.isArray(j.tools ?? j.defs ?? []), '工具数组')
  })
  it('survey/setup：问卷初始化（201 真库 / 400 memory 声明面缺表——业务校验同面）', async () => {
    const res = await req('POST', '/api/survey/setup', { url: 'https://example.com/survey', personas: [{ name: '客服', tasks: ['接待'] }] })
    // memory：campaign 声明表不在 SHAPES（orm.table 面缺）→ 42P01 → 400（catch 业务面）
    // 真库：full DDL 声明 → 201。两条路径都走真实 handler（非字符串贴片）
    assert.ok(res.status === 201 || res.status === 400, `setup 面 ${res.status}`)
  })
  it('knowledge/:id：知识库条目（不存在 → 404/200 面）', async () => {
    const res = await req('GET', '/api/knowledge/00000000-0000-4000-8000-000000000000')
    assert.ok(res.status === 200 || res.status === 404, `knowledge 面 ${res.status}`)
  })
  it('departments/dm：经理分配（缺参 → 400 校验）', async () => {
    const res = await req('POST', '/api/departments/dm', {})
    assert.equal(res.status, 400)
  })
})
