/**
 * weifuwu/workflows — workflow 系统测试（memory sql——DDL no-op 惰性建表）
 *
 * 覆盖：compileGate（wfjs/def 门）/ CRUD（appId 隔离）/ 执行落库（success/error）/
 * 视图适配（dag/schema）——系统性验证框架系统面。
 */
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createMemoryOrm } from '../db/memory-sql.ts'
import { workflowSystem, WEIFUWU_WORKFLOW_SCHEMA } from './index.ts'

const GOOD_WFJS = `const res = await log({ message: 'hello' })
const n = res.data
if (vars.n !== null) { const m = await log({ message: 'ok' }) }`

describe('workflowSystem (memory sql)', () => {
  const db = createMemoryOrm()
  db.mem.applySchema(WEIFUWU_WORKFLOW_SCHEMA)
  const sys = workflowSystem({ orm: db.orm })

  before(async () => {
    // 建表由 applySchema 完成（migrate 已并入迁移编排）
  })
  after(async () => {
    await db.close()
  })

  it('compileGate：wfjs → validate → def + wfjs 渲染', async () => {
    const { def, wfjs } = await sys.wf.compileGate({ wfjs: GOOD_WFJS })
    assert.equal(def.steps[0].type, 'log')
    assert.match(wfjs, /const res = await log/)
  })
  it('compileGate：def 直入 + 非法（未声明变量）拒绝', async () => {
    const { def } = await sys.wf.compileGate({ wfjs: GOOD_WFJS })
    const ok = await sys.wf.compileGate({ def })
    assert.ok(ok.def.steps.length)
    await assert.rejects(
      sys.wf.compileGate({ def: { steps: [{ id: 'a', type: 'log', when: 'vars.nope' }] } as never }),
      /校验失败/,
    )
  })
  it('CRUD：create → list/get → update（重编译）→ remove + appId 隔离', async () => {
    const rec = await sys.crud.create('app-1', { name: '告警', wfjs: GOOD_WFJS })
    assert.ok(rec.id)
    assert.equal(rec.name, '告警')
    assert.equal((rec.def_json as { steps: unknown[] }).steps.length, 3)
    const list = await sys.crud.list('app-1')
    assert.equal(list.length, 1)
    // 隔离：其他 app 不可见
    assert.equal(await sys.crud.get('app-2', rec.id), null)
    // 更新：换 def（重编译门）
    await sys.crud.update('app-1', rec.id, { name: '告警v2', wfjs: `const a = await log({ message: 'x' })` })
    const after = await sys.crud.get('app-1', rec.id)
    assert.equal(after!.name, '告警v2')
    assert.equal((after!.def_json as { steps: unknown[] }).steps.length, 1)
    // remove
    await sys.crud.remove('app-1', rec.id)
    assert.equal(await sys.crud.get('app-1', rec.id), null)
  })
  it('执行落库：success（纯步骤）→ run 记录 + result_json', async () => {
    const rec = await sys.crud.create('app-1', { name: '跑', wfjs: `const x = 1\nconst y = await log({ message: 'm' })` })
    const run = await sys.wf.execute('app-1', rec.id, {})
    assert.equal(run.status, 'success')
    assert.ok(run.result_json)
    assert.equal(run.trigger, 'manual')
    // runs 历史可查
    const runs = await sys.crud.listRuns('app-1', rec.id)
    assert.equal(runs.length, 1)
    const got = await sys.crud.getRun('app-1', rec.id, run.id)
    assert.equal(got!.id, run.id)
  })
  it('执行落库：error（执行期失败）→ run error + 错误消息', async () => {
    const rec = await sys.crud.create('app-1', { name: '坏', wfjs: `const x = await log({ message: 'm' })` })
    // 故意破坏 def（执行期未知步骤类型）——直接 executeDef
    const badDef = { steps: [{ id: 'a', type: 'nope', config: {} }] } as never
    const r = await sys.wf.executeDef(badDef, {})
    assert.equal(r.status, 'error')
    assert.match(r.error ?? '', /nope/)
  })
  it('视图适配：dag（子链折叠）+ schema（步骤元数据）', async () => {
    const { def } = await sys.wf.compileGate({ wfjs: GOOD_WFJS })
    const dag = sys.wf.dag(def)
    assert.equal(dag.nodes.length, 3)
    assert.match(dag.nodes[2].label, /条件/)
    const schema = sys.wf.schema()
    assert.ok(schema.properties!.log)
    assert.equal(schema.properties!.log.title, '日志')
    const js = sys.wf.defToWfjs(def)
    assert.match(js, /log/)
  })

  // ── 健壮性（2027-09）：executeRun 中间态——先 running 后终态（history 不悬空错态） ──
  it('执行完成后 status=success + result 落库（running → success 终态）', async () => {
    const w = await sys.crud.create('app-x', { name: 'run 中间态', wfjs: 'await log({ message: "hi" })' })
    const run = await sys.wf.execute('app-x', w.id, {}, 'manual')
    assert.equal(run.status, 'success')
    assert.ok(run.finished_at, 'finished_at 已填')
    const runs = await sys.crud.listRuns('app-x', w.id)
    assert.equal(runs[0].status, 'success')
    assert.ok(runs[0].result_json, 'result_json 落库')
  })
  it('执行失败 → status=error 终态（不悬空 running）', async () => {
    const w = await sys.crud.create('app-x', { name: 'run 失败', wfjs: 'const x = await log({ message: "x" })\nconst y = 1 / 0' })
    const run = await sys.wf.execute('app-x', w.id, {}, 'manual')
    assert.equal(run.status, 'error')
    assert.match(run.error ?? '', /non-finite/, `错误信息：${run.error}`)
    const runs = await sys.crud.listRuns('app-x', w.id)
    assert.equal(runs[0].status, 'error')
  })
})
