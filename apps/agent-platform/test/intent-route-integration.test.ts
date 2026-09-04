/**
 * 意图路由集成测试（ORCHESTRATION-PLAN Wave 2——O8 链路）
 *
 * handleNewMessage 无 @ 时：语义路由命中的 Agent 收到回复（targets 收敛）——
 * 未命中的不触发（省 token）——AI 回复路由指示落库（routed_to）。
 *
 * 形态：真库 + mock AI（agent.runToResult 记录调用）+ mock embed
 * （三角向量——可预测 top1）——断言「调用方只看被路由 Agent」+ routed_to 落库。
 */
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { postgres } from 'weifuwu'
import { handleNewMessage } from '../src/services/chat.ts'
import { AGENT_PLATFORM_SCHEMA } from '../src/db/tables.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const APP_ID = '00000000-0000-0000-0000-000000000001'
const DEPT = '00000000-0000-0000-0000-000000000060'
const USER = '00000000-0000-0000-0000-000000000061'
const AGENT_ANALYST = '00000000-0000-0000-0000-000000000062'
const AGENT_CS = '00000000-0000-0000-0000-000000000063'

let pg: any
/** mock embed：文本 → 三角向量（可预测 top1——与 intent-route.test 同构） */
function mockEmbed(text: string): number[] {
  if (/数据|分析|Q3|销售|报表/.test(text)) return [1, 0, 0]
  if (/退款|客诉|安抚|客服/.test(text)) return [0, 1, 0]
  return [0, 0, 1]
}
/** 记录被 agent() 调用过的 Agent（targets 收敛断言） */
const calledAgents: string[] = []

before(async () => {
  pg = postgres({ memory: true })
  // 协议层 = AST：声明式建库（migrateModule——零 SQL 文本）；memory 实例无残留（DROP 不需要）
  await pg.migrateModule('test-full', AGENT_PLATFORM_SCHEMA as never)
  await pg.orm.query.insert('departments').rows([{ id: DEPT, app_id: APP_ID, name: '路由测试部' }]).run()
  await pg.orm.query.insert('agents').rows([
    { id: USER, app_id: APP_ID, type: 'user', name: '用户' },
    { id: AGENT_ANALYST, app_id: APP_ID, type: 'ai', name: '数据分析师', system_prompt: '你是数据分析师', role_label: '数据分析', expertise: 'Excel/报表/销售分析' },
    { id: AGENT_CS, app_id: APP_ID, type: 'ai', name: '客服', system_prompt: '你是客服专员', role_label: '客户服务', expertise: '退款/客诉安抚' },
  ]).run()
  await pg.orm.query.insert('department_members').rows([
    { department_id: DEPT, agent_id: USER, role: 'admin' },
    { department_id: DEPT, agent_id: AGENT_ANALYST, role: 'member' },
    { department_id: DEPT, agent_id: AGENT_CS, role: 'member' },
  ]).run()
})

after(async () => {
  if (pg) await pg.close()
})

function makeCtx(): any {
  return {
    sql: pg.sql, orm: (pg as any).orm,
    orm: (pg as any).orm,
    appId: APP_ID,
    auth: { userId: USER, appId: APP_ID, email: 't@t.com', name: 'T', role: 'owner' },
    ai: {
      // agent() 记录调用 + 返回确定回复——判定用 base prompt 前缀
      // （buildPersonaLayer 注入全员名册——includes 会被名册里的「数据分析师」污染）
      agent: (config: any) => {
        calledAgents.push(String(config.systemPrompt ?? '').startsWith('你是数据分析师') ? 'analyst' : 'cs')
        return { runToResult: async () => ({ content: `回复(${String(config.systemPrompt).slice(0, 4)})`, messages: [], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }) }
      },
      embed: async (t: string) => mockEmbed(String(t)),
    },
    msg: { broadcast: () => {} },
    limit: () => Promise.resolve(),
  }
}

describe('O8: 意图路由链路（handleNewMessage 收敛）', () => {
  it('无 @ + 命中数据分析 → 仅数据分析师被调用（客服不触发——省 token）', async () => {
    calledAgents.length = 0
    const ctx = makeCtx()
    process.env.INTENT_ROUTE = 'auto'
    await handleNewMessage(ctx, DEPT, USER, '帮我分析一下 Q3 销售报表')
    assert.deepEqual(calledAgents, ['analyst'], '仅路由 Agent 触发——客服不跑')
    // 落库断言：AI 回复带 routed_to = 数据分析师
    const reply = await pg.orm.query.from('messages').select('content', 'routed_to').where({ sender_id: { eq: AGENT_ANALYST } }).orderBy('created_at', 'desc').limit(1).run()
    assert.equal(String((reply[0] as any).routed_to), '数据分析师', '路由指示落库')
  })

  it('无 @ + 低相似度（正交）→ 回退广播（两 Agent 都触发——不退化）', async () => {
    calledAgents.length = 0
    const ctx = makeCtx()
    await handleNewMessage(ctx, DEPT, USER, '今天天气怎么样')
    assert.deepEqual(calledAgents.sort(), ['analyst', 'cs'], '回退广播——全部触发')
  })

  it('有 @ 定向 → 路由不干涉（只触发被 @ 的）', async () => {
    calledAgents.length = 0
    const ctx = makeCtx()
    await handleNewMessage(ctx, DEPT, USER, '@客服 安抚一下这个用户')
    assert.deepEqual(calledAgents, ['cs'], '@ 定向优先——路由不干涉')
  })

  it('INTENT_ROUTE=off → 关闭路由（回退广播）', async () => {
    calledAgents.length = 0
    process.env.INTENT_ROUTE = 'off'
    const ctx = makeCtx()
    await handleNewMessage(ctx, DEPT, USER, '帮我分析一下 Q3 销售报表')
    assert.deepEqual(calledAgents.sort(), ['analyst', 'cs'], '关闭路由——广播不退化')
    delete process.env.INTENT_ROUTE
  })
})
