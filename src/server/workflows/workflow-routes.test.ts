/**
 * weifuwu/workflows — 路由层契约测试（HTTP API + ctx.auth.appId 注入）
 *
 * 覆盖：匿名拒绝（appId 缺失）/ 创建（compileGate 门）/ 列表隔离 / 详情（dag）/
 * 执行落库 / runs 历史 / 非法 wfjs 400 / 404。
 */
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createMemorySql } from '../db/memory-sql.ts'
import { workflowSystem } from './index.ts'
import { Router } from '../core/router.ts'

const GOOD_WFJS = `const res = await log({ message: 'hi' })
const n = 1`

describe('workflowSystem routes（HTTP 契约）', () => {
  const db = createMemorySql()
  const system = workflowSystem({ sql: db })
  const app = new Router()
  let currentAppId: string | null = 'app-1'
  // ctx.auth.appId 注入（缺省提取器来源——user 会话透传的替身）
  app.use(async (_req: Request, ctx: any, next: any) => {
    ctx.auth = currentAppId ? { appId: currentAppId } : undefined
    return next(_req, ctx)
  })
  app.use(system)
  system.routes(app)
  const handler = app.handler()
  const setApp = (id: string | null) => { currentAppId = id }

  before(async () => { await system.migrate() })
  after(async () => { await db.close() })

  async function req(method: string, path: string, body?: unknown) {
    return handler(new Request(`http://localhost${path}`, {
      method,
      headers: body ? { 'content-type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    }), { params: {}, query: {} } as never)
  }

  it('匿名（无 appId）→ 400 拒绝（默认即安全）', async () => {
    setApp(null)
    try {
      const res = await req('GET', '/api/workflows')
      assert.equal(res.status, 400)
    } finally { setApp('app-1') }
  })

  it('创建（wfjs 门）→ 201 + 记录；非法 wfjs → 400', async () => {
    const ok = await req('POST', '/api/workflows', { name: '告警', wfjs: GOOD_WFJS })
    assert.equal(ok.status, 201)
    const { workflow } = await ok.json() as { workflow: { id: string; def_json: { steps: unknown[] }; src_wfjs: string } }
    assert.ok(workflow.id)
    assert.equal(workflow.def_json.steps.length, 2)
    assert.match(workflow.src_wfjs, /log/)
    const bad = await req('POST', '/api/workflows', { name: '坏', wfjs: 'const x = y' })
    assert.equal(bad.status, 400)
    assert.match((await bad.json() as { error: string }).error, /未声明变量 'y'/)
  })

  it('列表 appId 隔离 + 详情（dag）', async () => {
    const created = await req('POST', '/api/workflows', { name: 'A 的', wfjs: GOOD_WFJS })
    const { workflow } = await created.json() as { workflow: { id: string } }
    const listA = await (await req('GET', '/api/workflows')).json() as { workflows: unknown[] }
    assert.ok(listA.workflows.length >= 1, 'app-1 可见自己创建的')
    // 切 app 隔离
    setApp('app-2')
    const listB = await (await req('GET', '/api/workflows')).json() as { workflows: unknown[] }
    assert.equal(listB.workflows.length, 0)
    const detail = await req('GET', `/api/workflows/${workflow.id}`)
    assert.equal(detail.status, 404, '跨 app 详情 → 404')
    setApp('app-1') // 恢复（断言已过——防御后续失败级联）
    const my = await (await req('GET', `/api/workflows/${workflow.id}`)).json() as {
      workflow: { dag: { nodes: { label: string }[] } }
    }
    assert.equal(my.workflow.dag.nodes.length, 2)
    assert.match(my.workflow.dag.nodes[0].label, /日志/)
  })

  it('执行落库 → 201 + run（success/error）', async () => {
    const created = await req('POST', '/api/workflows', { name: '跑', wfjs: GOOD_WFJS })
    const { workflow } = await created.json() as { workflow: { id: string } }
    const run = await req('POST', `/api/workflows/${workflow.id}/runs`, { args: {} })
    assert.equal(run.status, 201)
    const { run: r } = await run.json() as { run: { id: string; status: string } }
    assert.equal(r.status, 'success')
    const runs = await (await req('GET', `/api/workflows/${workflow.id}/runs`)).json() as { runs: unknown[] }
    assert.equal(runs.runs.length, 1)
  })

  it('不存在资源 → 404（详情/runs）', async () => {
    assert.equal((await req('GET', '/api/workflows/nope')).status, 404)
    assert.equal((await req('GET', '/api/workflows/nope/runs')).status, 404)
  })

  it('meta（schemas——JsonSchemaForm 直消费）', async () => {
    const meta = await (await req('GET', '/api/workflows/meta')).json() as { schemas: Record<string, unknown> }
    assert.ok(meta.schemas.properties)
    assert.ok((meta.schemas.properties as Record<string, unknown>).log)
  })
})
