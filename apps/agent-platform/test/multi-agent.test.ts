/**
 * 多 Agent 协作测试（MULTI-AGENT-PLAN M1）——call_agent 工具定义 + 执行器
 *
 * 场景：A 调 B（返回子回复）/ 目标不存在 / 非 ai 类型 / 深度超限 / 循环
 */

import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { postgres } from 'weifuwu'
import { BUILTIN_TOOL_DEFS, registerBuiltinTools } from '../src/tools/builtin.ts'
import { getToolHandler } from '../src/tools/registry.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const APP_ID = '00000000-0000-0000-0000-000000000001'
const AGENT_A = '00000000-0000-0000-0000-000000000030'
const AGENT_B = '00000000-0000-0000-0000-000000000031'

let pg: any
let ctx: any

// mock AI：runAgent 用 ai.agent(...).runToResult——返回可配置 content
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
    DROP TABLE IF EXISTS agent_versions CASCADE;
    DROP TABLE IF EXISTS audit_logs CASCADE;
    DROP TABLE IF EXISTS agent_logs CASCADE;
    DROP TABLE IF EXISTS messages CASCADE;
    DROP TABLE IF EXISTS department_members CASCADE;
    DROP TABLE IF EXISTS departments CASCADE;
    DROP TABLE IF EXISTS agents CASCADE;
    DROP TYPE IF EXISTS agent_type CASCADE;
  `)
  await pg.sql.unsafe(schema)
  await pg.sql`INSERT INTO agents (id, app_id, type, name, system_prompt) VALUES (${AGENT_A}, ${APP_ID}, 'ai', '编排Agent', '你是编排者')`
  await pg.sql`INSERT INTO agents (id, app_id, type, name, system_prompt) VALUES (${AGENT_B}, ${APP_ID}, 'ai', '数据分析师', '你是数据分析师')`
  await pg.sql`INSERT INTO agents (id, app_id, type, name) VALUES ('00000000-0000-0000-0000-000000000032', ${APP_ID}, 'user', '真人用户')`

  ctx = {
    sql: pg.sql, orm: (pg as any).orm,
    appId: APP_ID,
    ai: mockAiClient,
    auth: { userId: 't', appId: APP_ID, email: 't@t.com', name: 'T', role: 'member' },
    _toolAgentId: AGENT_A,
  }
  // 注册内置工具 handler（getCtx 返回测试 ctx）
  registerBuiltinTools(() => ctx)
})

after(async () => {
  if (pg) await pg.close()
})

describe('call_agent 工具定义', () => {
  it('BUILTIN_TOOL_DEFS 含 call_agent（name/description/parameters）', () => {
    const def = BUILTIN_TOOL_DEFS.find(d => d.function.name === 'call_agent')
    assert.ok(def, 'call_agent 定义存在')
    assert.ok(def!.function.description.includes('另一个 AI Agent'))
    const props = def!.function.parameters.properties as Record<string, any>
    assert.ok(props.agent, 'agent 参数')
    assert.ok(props.message, 'message 参数')
    assert.deepEqual(def!.function.parameters.required, ['agent', 'message'])
  })

  it('handler 已注册', () => {
    assert.equal(typeof getToolHandler('call_agent'), 'function')
  })
})

describe('call_agent 执行器', () => {
  it('场景1：A 调 B → 返回 B 的回复', async () => {
    const handler = getToolHandler('call_agent')!
    const result = await handler({ agent: '数据分析师', message: '帮我分析销售数据' }) as string
    assert.ok(result.includes('数据分析师 的回复'), `应标注来源: ${result}`)
    assert.ok(result.includes('子Agent回复(你是数据分析师'), `应含子 Agent 回复: ${result}`)
  })

  it('场景1b：按 ID 调用', async () => {
    const handler = getToolHandler('call_agent')!
    const result = await handler({ agent: AGENT_B, message: '按 ID 调用' }) as string
    assert.ok(result.includes('数据分析师 的回复'))
  })

  it('场景3：目标不存在 → 明确错误', async () => {
    const handler = getToolHandler('call_agent')!
    const result = await handler({ agent: '不存在的Agent', message: 'hi' }) as string
    assert.ok(result.includes('找不到可调用的 AI Agent'), result)
  })

  it('场景3b：非 ai 类型（user）被拒绝', async () => {
    const handler = getToolHandler('call_agent')!
    const result = await handler({ agent: '真人用户', message: 'hi' }) as string
    assert.ok(result.includes('找不到可调用的 AI Agent'), result)
  })

  it('场景3c：异租户目标被拒绝（同名字异租户）', async () => {
    await pg.sql`INSERT INTO agents (id, app_id, type, name) VALUES ('99999999-0000-0000-0000-000000000001', '99999999-9999-9999-9999-999999999999', 'ai', '异租户Agent')`
    const handler = getToolHandler('call_agent')!
    const result = await handler({ agent: '异租户Agent', message: 'hi' }) as string
    assert.ok(result.includes('找不到可调用的 AI Agent'), result)
  })

  it('场景4：深度超限（嵌套 call_agent 深度 ≥ 2 被拦截）', async () => {
    const handler = getToolHandler('call_agent')!
    ctx._agentDepth = 2 // 模拟已到最大深度
    const result = await handler({ agent: '数据分析师', message: 'hi' }) as string
    assert.ok(result.includes('深度超限'), result)
    ctx._agentDepth = 0
  })

  it('场景5：调用自己（循环）被拒绝', async () => {
    const handler = getToolHandler('call_agent')!
    // **toolCtx 通道（2027-09——闭包注入退役）**：业务上下文经
    // AgentConfig.toolContext → 参数透传——循环检测读 toolCtx.agentId
    const result = await handler({ agent: '编排Agent', message: 'hi' }, { agentId: AGENT_A, departmentId: 'dept-x' }) as string
    assert.ok(result.includes('不能调用自己'), result)
  })

  it('场景7：子 Agent 调用写入 agent_logs（department_id NULL——被调用无部门）', async () => {
    const handler = getToolHandler('call_agent')!
    await handler({ agent: '数据分析师', message: '帮我统计' })
    const logs = await pg.sql`SELECT agent_id, department_id, success FROM agent_logs WHERE agent_id = ${AGENT_B} ORDER BY created_at DESC LIMIT 1`
    assert.equal(logs.length, 1, '子 Agent 有日志')
    assert.equal(logs[0].department_id, null, '无部门（NULL）')
    assert.equal(logs[0].success, true)
  })

  it('场景6：深度在调用后恢复（同 Agent 多次调用）', async () => {
    const handler = getToolHandler('call_agent')!
    await handler({ agent: '数据分析师', message: '第一问' })
    assert.equal(ctx._agentDepth, 0, '调用后深度恢复')
  })
})
