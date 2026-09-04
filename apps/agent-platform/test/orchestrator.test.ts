/**
 * 智能编排契约测试（ORCHESTRATION-PLAN Wave 1——O1-O5）——plan_tasks 工具
 *
 * 场景：编排 Agent 调 plan_tasks 拆解复杂任务 → 并行派发多个专业 Agent →
 * 汇总带来源标注（O1 定义/O2 并行/O3 worker 复用 runAgent/O4 汇总）。
 * O5 复杂度判定 = 提示词纪律（TASK_DISCIPLINE 注入——LLM 判断——诚实裁剪）。
 *
 * 形态与 multi-agent.test.ts 同构：真库（demo_ma_test）+ mock AI +
 * registerBuiltinTools(测试 ctx)——契约层（命令级断言——工具返回形态）。
 */
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { postgres } from 'weifuwu'
import { BUILTIN_TOOL_DEFS, registerBuiltinTools } from '../src/tools/builtin.ts'
import { getToolHandler } from '../src/tools/registry.ts'
import { TASK_DISCIPLINE } from '../src/services/task-decisions.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const APP_ID = '00000000-0000-0000-0000-000000000001'
const ORCH = '00000000-0000-0000-0000-000000000040'   // 编排 Agent
const WORKER_A = '00000000-0000-0000-0000-000000000041' // 数据分析师
const WORKER_B = '00000000-0000-0000-0000-000000000042' // 客服
const WORKER_C = '00000000-0000-0000-0000-000000000043' // 文档助手

let pg: any
let ctx: any

// mock AI：runAgent（worker 用）返回可配置 content——并发时序可观测
const mockAiClient = {
  agent: (config: any) => ({
    runToResult: async (messages: any[]) => ({
      content: `子Agent回复(${String(config.systemPrompt ?? '').slice(0, 8)}): ${messages.map((m: any) => m.content).join(', ')}`,
      messages: [],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    }),
  }),
  chat: async () => ({ choices: [{ message: { content: 'x' } }] }),
  chatStream: async () => {},
  embed: async () => [0],
}

before(async () => {
  pg = postgres({ memory: true })
  const schema = readFileSync(resolve(__dirname, '..', 'src', 'db', 'schema.sql'), 'utf-8')
  await pg.sql.unsafe(`
    DROP TABLE IF EXISTS agent_versions CASCADE; DROP TABLE IF EXISTS audit_logs CASCADE;
    DROP TABLE IF EXISTS agent_logs CASCADE; DROP TABLE IF EXISTS messages CASCADE;
    DROP TABLE IF EXISTS department_members CASCADE; DROP TABLE IF EXISTS departments CASCADE;
    DROP TABLE IF EXISTS agents CASCADE; DROP TYPE IF EXISTS agent_type CASCADE;
  `)
  await pg.sql.unsafe(schema)
  await pg.sql`INSERT INTO agents (id, app_id, type, name, system_prompt) VALUES (${ORCH}, ${APP_ID}, 'ai', '编排Agent', '你是编排者')`
  await pg.sql`INSERT INTO agents (id, app_id, type, name, system_prompt) VALUES (${WORKER_A}, ${APP_ID}, 'ai', '数据分析师', '你是数据分析师')`
  await pg.sql`INSERT INTO agents (id, app_id, type, name, system_prompt) VALUES (${WORKER_B}, ${APP_ID}, 'ai', '客服', '你是客服专员')`
  await pg.sql`INSERT INTO agents (id, app_id, type, name, system_prompt) VALUES (${WORKER_C}, ${APP_ID}, 'ai', '文档助手', '你是文档助手')`

  ctx = {
    sql: pg.sql, orm: (pg as any).orm,
    appId: APP_ID,
    ai: mockAiClient,
    auth: { userId: 't', appId: APP_ID, email: 't@t.com', name: 'T', role: 'member' },
    _toolAgentId: ORCH,
  }
  registerBuiltinTools(() => ctx)
})

after(async () => {
  if (pg) await pg.close()
})

describe('O1: plan_tasks 工具定义', () => {
  it('BUILTIN_TOOL_DEFS 含 plan_tasks（name/description/parameters）', () => {
    const def = BUILTIN_TOOL_DEFS.find(d => d.function.name === 'plan_tasks')
    assert.ok(def, 'plan_tasks 定义存在')
    assert.ok(def!.function.description.includes('拆解'), '描述含拆解语义')
    assert.ok(def!.function.description.includes('并行'), '描述含并行语义')
    const props = def!.function.parameters.properties as Record<string, any>
    assert.ok(props.tasks, 'tasks 参数（数组）')
    const items = props.tasks.items.properties
    assert.ok(items.agent && items.message, '子任务项含 agent/message')
    assert.deepEqual(def!.function.parameters.required, ['tasks'])
  })

  it('handler 已注册', () => {
    assert.equal(typeof getToolHandler('plan_tasks'), 'function')
  })
})

describe('O2/O3/O4: plan_tasks 执行器', () => {
  it('场景1：两子任务并行 → 双结果带来源标注', async () => {
    const handler = getToolHandler('plan_tasks')!
    const result = await handler({
      tasks: [
        { agent: '数据分析师', message: '分析 Q3 销售数据并给出结论' },
        { agent: '客服', message: '整理常见退款问题话术' },
      ],
    }) as string
    assert.ok(result.includes('数据分析师 的回复'), '来源标注 A')
    assert.ok(result.includes('客服 的回复'), '来源标注 B')
    assert.ok(result.includes('子Agent回复(你是数据分析师'), 'worker A 回复内容')
    assert.ok(result.includes('子Agent回复(你是客服专员'), 'worker B 回复内容')
    assert.ok(result.indexOf('数据分析师 的回复') < result.indexOf('客服 的回复'), '按任务数组顺序拼接')
  })

  it('场景2：三子任务（并发上限）= 全部完成', async () => {
    const handler = getToolHandler('plan_tasks')!
    const result = await handler({
      tasks: [
        { agent: '数据分析师', message: '任务1' },
        { agent: '客服', message: '任务2' },
        { agent: '文档助手', message: '任务3' },
      ],
    }) as string
    for (const name of ['数据分析师', '客服', '文档助手']) {
      assert.ok(result.includes(`${name} 的回复`), `含 ${name} 结果`)
    }
  })

  it('场景3：失败隔离——单 worker 失败不炸整体（其余结果保留）', async () => {
    const handler = getToolHandler('plan_tasks')!
    // 目标不存在 → 该 worker 失败
    const result = await handler({
      tasks: [
        { agent: '数据分析师', message: '正常任务' },
        { agent: '不存在的Agent', message: '失败任务' },
      ],
    }) as string
    assert.ok(result.includes('数据分析师 的回复'), '正常 worker 结果保留')
    assert.ok(result.includes('不存在的Agent'), '失败注明目标名')
  })

  it('场景4：参数防护——tasks 为空/超 3 个/缺 message', async () => {
    const handler = getToolHandler('plan_tasks')!
    const empty = await handler({ tasks: [] }) as string
    assert.ok(empty.includes('Error'), '空 tasks 报错')

    // 超 3 个：截断为前 3 个（LLM 乱给不信任——成本纪律）——不报错
    const many = await handler({
      tasks: [
        { agent: '数据分析师', message: 't1' },
        { agent: '客服', message: 't2' },
        { agent: '文档助手', message: 't3' },
        { agent: '数据分析师', message: 't4' }, // 第 4 个截断
      ],
    }) as string
    assert.ok(many.includes('数据分析师 的回复'), '前 3 执行')
    assert.ok(!many.includes('t4'), '第 4 个截断')

    const noMsg = await handler({ tasks: [{ agent: '数据分析师' }] }) as string
    assert.ok(noMsg.includes('Error'), '缺 message 报错')
  })

  it('场景5：循环防护——调用自己拒绝', async () => {
    const handler = getToolHandler('plan_tasks')!
    // mock 编排 Agent 名 = 编排Agent（toolCtx.agentId = ORCH——2027-09 通道）
    const result = await handler({ tasks: [{ agent: '编排Agent', message: '自调用' }] }, { agentId: ORCH, departmentId: 'dept-x' }) as string
    assert.ok(result.includes('不能调用自己'), '循环拒绝')
  })

  it('场景6：not found——目标非 AI/其他租户 → 失败注明', async () => {
    const handler = getToolHandler('plan_tasks')!
    const result = await handler({ tasks: [{ agent: '路人甲', message: 'x' }] }) as string
    assert.ok(result.includes('找不到'), '目标不存在失败注明')
  })
})

describe('O5: 编排提示词纪律（TASK_DISCIPLINE 注入——复杂度判定）', () => {
  it('TASK_DISCIPLINE 含 plan_tasks 使用指导（简单任务别用——成本纪律）', () => {
    const s = TASK_DISCIPLINE
    assert.ok(s.includes('plan_tasks'), '含 plan_tasks 指导')
    assert.ok(/复杂|拆解/.test(s), '含拆解语义')
    assert.ok(/简单|直接回答/.test(s), '含简单任务直接回答纪律')
  })
})
