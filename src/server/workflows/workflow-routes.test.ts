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

  it('patch（步骤参数编辑）→ 深路径合并 → def 变 + wfjs 重渲染 + 校验门', async () => {
    const created = await req('POST', '/api/workflows', { name: '编', wfjs: `const res = await http({ url: 'http://x/' })
if (true) { await log({ message: '改我' }) }` })
    const { workflow } = await created.json() as { workflow: { id: string } }
    const wid = workflow.id
    // 顶层 URL 修改
    const p1 = await req('PUT', `/api/workflows/${wid}`, { patch: { path: [0], config: { url: 'http://new.example/x' } } })
    assert.equal(p1.status, 200)
    const det1 = await (await req('GET', `/api/workflows/${wid}`)).json() as any
    assert.equal(det1.workflow.def.steps[0].config.url, 'http://new.example/x')
    assert.match(det1.workflow.wfjs, /http:\/\/new\.example/)
    // 嵌套 then 子链（if 内 log message）
    const p2 = await req('PUT', `/api/workflows/${wid}`, { patch: { path: [1, 'then', 0], config: { message: '改过了' } } })
    assert.equal(p2.status, 200)
    const det2 = await (await req('GET', `/api/workflows/${wid}`)).json() as any
    assert.equal(det2.workflow.def.steps[1].config.then.steps[0].config.message, '改过了')
    // 校验门：把 http url 改成空 → patch 后 validate 拒绝（url 必填）
    const bad = await req('PUT', `/api/workflows/${wid}`, { patch: { path: [0], config: { url: '' } } })
    assert.equal(bad.status, 400)
    assert.match((await bad.json() as { error: string }).error, /校验失败|必填/)
    // 不存在 workflow
    assert.equal((await req('PUT', '/api/workflows/nope', { patch: { path: [0], config: { url: 'x' } } })).status, 404)
  })

  it('insert/remove 步骤（编辑器完整闭环）', async () => {
    const created = await req('POST', '/api/workflows', { name: '增删', wfjs: `const res = await http({ url: 'http://x/' })
if (true) { await log({ message: 'i' }) }` })
    const { workflow } = await created.json() as { workflow: { id: string } }
    const wid = workflow.id
    // insert log 到顶层
    const ins = await req('PUT', `/api/workflows/${wid}`, { patch: { op: 'insert', arrPath: [], step: { type: 'log', config: { message: '新增' } } } })
    assert.equal(ins.status, 200)
    const d1 = await (await req('GET', `/api/workflows/${wid}`)).json() as any
    assert.equal(d1.workflow.def.steps.length, 3)
    assert.match(d1.workflow.def.steps[2].config.message, /新增/)
    // insert 到 then 子链
    const ins2 = await req('PUT', `/api/workflows/${wid}`, { patch: { op: 'insert', anchor: d1.workflow.def.steps[1].id, chain: ['then'], step: { type: 'log', config: { message: '子' } } } })
    if (ins2.status !== 200) console.log('[ins2 error]', (await ins2.json() as any).error)
    assert.equal(ins2.status, 200)
    const d2 = await (await req('GET', `/api/workflows/${wid}`)).json() as any
    assert.equal(d2.workflow.def.steps[1].config.then.steps.length, 2)
    // validate 门：insert 空 url 的 http → 拒绝
    const bad = await req('PUT', `/api/workflows/${wid}`, { patch: { op: 'insert', anchor: null, chain: [], step: { type: 'http', config: { url: '' } } } })
    assert.equal(bad.status, 400)
    // remove 顶层步骤
    const rem = await req('PUT', `/api/workflows/${wid}`, { patch: { op: 'remove', path: [0] } })
    assert.equal(rem.status, 200)
    const d3 = await (await req('GET', `/api/workflows/${wid}`)).json() as any
    assert.equal(d3.workflow.def.steps.length, 2)
  })

  it('版本历史：创建 v1 → 编辑 v2 → 回滚 → def/wfjs 同步', async () => {
    const created = await req('POST', '/api/workflows', { name: '版本', wfjs: `const res = await log({ message: 'A' })` })
    const { workflow } = await created.json() as { workflow: { id: string } }
    const wid = workflow.id
    // 创建即 v1
    const v1 = await (await req('GET', `/api/workflows/${wid}/versions`)).json() as { versions: { id: string; note: string | null }[] }
    assert.equal(v1.versions.length, 1)
    assert.equal(v1.versions[0].note, '初始版本')
    const v1Id = v1.versions[0].id
    // 编辑 → v2
    await req('PUT', `/api/workflows/${wid}`, { patch: { path: [0], config: { message: 'B' } } })
    const v2 = await (await req('GET', `/api/workflows/${wid}/versions`)).json() as { versions: { id: string }[] }
    assert.equal(v2.versions.length, 2)
    // 回滚到 v1
    const rb = await req('POST', `/api/workflows/${wid}/versions/${v1Id}/rollback`)
    assert.equal(rb.status, 200)
    const det = await (await req('GET', `/api/workflows/${wid}`)).json() as { workflow: { def: { steps: { config: { message: string } }[] }; wfjs: string } }
    assert.equal(det.workflow.def.steps[0].config.message, 'A')
    assert.match(det.workflow.wfjs, /'A'/)
    // 回滚也记版本（审计链）
    const v3 = await (await req('GET', `/api/workflows/${wid}/versions`)).json() as { versions: { note: string | null }[] }
    assert.equal(v3.versions.length, 3)
    assert.match(String(v3.versions[0].note ?? ''), /回滚/)
    // 不存在 workflow/版本 → 404
    assert.equal((await req('GET', '/api/workflows/nope/versions')).status, 404)
    assert.equal((await req('POST', `/api/workflows/${wid}/versions/nope/rollback`)).status, 404)
  })
})
