/**
 * 编排任务树 + 重试降级契约测试（ORCHESTRATION-PLAN Wave 3——O9/O11）
 *
 * O11：plan_tasks 执行 → agent_runs 落库（orchestration run——plan_json/
 * worker_results/status——done/partial/failed 三态判定）——审计面。
 * O9：worker 执行失败（调用 Agent 失败）→ 重试 1 次——仍败 → 记 error
 * ——「部分完成」标注（不静默）；确定性错误（目标不存在）不重试。
 *
 * 真库（demo_ma_test——agent_runs 表由 schema.sql 提供）+ mock AI。
 */
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { postgres } from 'weifuwu'
import { BUILTIN_TOOL_DEFS, registerBuiltinTools } from '../src/tools/builtin.ts'
import { getToolHandler } from '../src/tools/registry.ts'
import { registerStatsRoutes } from '../src/routes/stats.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const APP_ID = '00000000-0000-0000-0000-000000000001'
const ORCH = '00000000-0000-0000-0000-000000000040'
const WORKER_A = '00000000-0000-0000-0000-000000000041'
const WORKER_B = '00000000-0000-0000-0000-000000000042'

let pg: any
let ctx: any
/** worker A 调用计数（重试断言——runAgent 执行计数） */
let workeraCalls = 0

before(async () => {
  pg = postgres('postgres://root:123456@localhost:5432/demo_ma_test', { max: 5, closeTimeout: 1 })
  const schema = readFileSync(resolve(__dirname, '..', 'src', 'db', 'schema.sql'), 'utf-8')
  await pg.sql.unsafe(`
    DROP TABLE IF EXISTS agent_runs CASCADE; DROP TABLE IF EXISTS agent_versions CASCADE;
    DROP TABLE IF EXISTS audit_logs CASCADE; DROP TABLE IF EXISTS agent_logs CASCADE;
    DROP TABLE IF EXISTS messages CASCADE; DROP TABLE IF EXISTS department_members CASCADE;
    DROP TABLE IF EXISTS departments CASCADE; DROP TABLE IF EXISTS agents CASCADE;
    DROP TYPE IF EXISTS agent_type CASCADE;
  `)
  await pg.sql.unsafe(schema)
  await pg.sql`INSERT INTO agents (id, app_id, type, name, system_prompt) VALUES
    (${ORCH}, ${APP_ID}, 'ai', '编排Agent', '你是编排者'),
    (${WORKER_A}, ${APP_ID}, 'ai', '数据分析师', '你是数据分析师'),
    (${WORKER_B}, ${APP_ID}, 'ai', '客服', '你是客服专员')`

  ctx = {
    sql: pg.sql,
    appId: APP_ID,
    ai: {
      agent: (config: any) => {
        if (String(config.systemPrompt).startsWith('你是数据分析师')) workeraCalls++
        return {
          runToResult: async () => {
            // worker A 首次失败（模拟执行异常——重试目标）—第二次成功
            if (String(config.systemPrompt).startsWith('你是数据分析师') && workeraCalls === 1) {
              throw new Error('模拟执行超时')
            }
            return { content: `子Agent回复(${String(config.systemPrompt ?? '').slice(0, 6)})`, messages: [], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }
          },
        }
      },
      chat: async () => ({ choices: [{ message: { content: 'x' } }] }),
      chatStream: async () => {},
      embed: async () => [0],
    },
    auth: { userId: 't', appId: APP_ID, email: 't@t.com', name: 'T', role: 'member' },
    _toolAgentId: ORCH,
    _toolDepartmentId: '',
    requestId: 'req-test-tree',
  }
  registerBuiltinTools(() => ctx)
})

after(async () => {
  if (pg) await pg.close()
})

describe('O11: 任务树落库', () => {
  it('plan_tasks 执行 → agent_runs 落库（done——plan_json/worker_results）', async () => {
    const handler = getToolHandler('plan_tasks')!
    await handler({ tasks: [{ agent: '数据分析师', message: '分析数据' }, { agent: '客服', message: '整理话术' }] })
    const [run] = await pg.sql`SELECT * FROM agent_runs WHERE app_id = ${APP_ID} ORDER BY created_at DESC LIMIT 1`
    assert.ok(run, 'run 落库')
    assert.equal(String((run as any).kind), 'orchestration')
    assert.equal(String((run as any).status), 'done')
    const plan = typeof (run as any).plan_json === 'string' ? JSON.parse(String((run as any).plan_json)) : (run as any).plan_json
    assert.equal(plan.length, 2, 'plan_json 含子任务清单')
    const workers = typeof (run as any).worker_results === 'string' ? JSON.parse(String((run as any).worker_results)) : (run as any).worker_results
    assert.equal(workers.length, 2, 'worker_results 全量')
    assert.ok(workers.every((w: any) => w.status === 'ok'), '全 ok')
  })

  it('部分失败 → partial（非全 ok 非全败——worker_results 记录 error）', async () => {
    workeraCalls = 0 // 重置——首调用失败→重试成功；但目标不存在 worker 全程失败
    const handler = getToolHandler('plan_tasks')!
    await handler({
      tasks: [
        { agent: '数据分析师', message: '分析数据' },  // 失败→重试→成功（ok）
        { agent: '不存在的Agent', message: 'x' },       // 确定性失败（error）
      ],
    })
    const [run] = await pg.sql`SELECT * FROM agent_runs WHERE app_id = ${APP_ID} ORDER BY created_at DESC LIMIT 1`
    assert.equal(String((run as any).status), 'partial', '部分失败 = partial')
    const workers = typeof (run as any).worker_results === 'string' ? JSON.parse(String((run as any).worker_results)) : (run as any).worker_results
    const errs = workers.filter((w: any) => w.status === 'error')
    assert.equal(errs.length, 1, '仅失败 worker 记 error')
    assert.ok(errs[0].agent.includes('不存在'), 'error 注明目标')
  })

  it('全失败 → failed（不静默）', async () => {
    const handler = getToolHandler('plan_tasks')!
    await handler({ tasks: [{ agent: '不存在的Agent1', message: 'x' }, { agent: '不存在的Agent2', message: 'y' }] })
    const [run] = await pg.sql`SELECT * FROM agent_runs WHERE app_id = ${APP_ID} ORDER BY created_at DESC LIMIT 1`
    assert.equal(String((run as any).status), 'failed')
  })

  it('request_id 贯穿（三端事件流关联键）', async () => {
    const [run] = await pg.sql`SELECT request_id FROM agent_runs WHERE app_id = ${APP_ID} ORDER BY created_at DESC LIMIT 1`
    assert.equal(String((run as any).request_id), 'req-test-tree', 'request_id 落库')
  })
})

describe('O9: 重试/降级', () => {
  it('worker 执行异常（重试型）→ 重试 1 次 → 成功（第二次调用）', async () => {
    workeraCalls = 0
    const handler = getToolHandler('plan_tasks')!
    const result = await handler({ tasks: [{ agent: '数据分析师', message: '分析' }] }) as string
    assert.equal(workeraCalls, 2, '首次失败 → 重试 → 共 2 次调用')
    assert.ok(result.includes('数据分析师 的回复'), '重试成功恢复')
  })

  it('确定性错误（找不到目标）→ 不重试（1 次调用即失败）', async () => {
    // mock：找不到目标——delegateToAgent 直接返回 Error（不调 runAgent）——
    // workeraCalls 不变——断言结果含「找不到」
    const handler = getToolHandler('plan_tasks')!
    const result = await handler({ tasks: [{ agent: '幽灵', message: 'x' }] }) as string
    assert.ok(result.includes('找不到'), '确定性错误直返')
  })
})

describe('O12: 编排审计端点', () => {
  it('/api/stats/runs——租户隔离返回（仅本 app）', async () => {
    const handlers = new Map<string, (req: Request, c: any) => Promise<Response>>()
    const app = { get: (p: string, h: any) => handlers.set(`GET ${p}`, h), post: () => {}, put: () => {}, delete: () => {} }
    registerStatsRoutes(app as any)
    const h = handlers.get('GET /api/stats/runs')
    assert.ok(h, '端点注册')
    const res = await h!(new Request('http://localhost/api/stats/runs?limit=5'), { sql: pg.sql, appId: APP_ID })
    assert.equal(res.status, 200)
    const { runs } = await res.json()
    assert.ok(Array.isArray(runs), 'runs 数组')
    assert.ok(runs.length >= 3, '含此前测试产生的编排记录')
    assert.ok(runs.every((r: any) => r.status), '状态字段')
  })
})
