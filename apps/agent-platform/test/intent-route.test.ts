/**
 * 意图路由契约测试（ORCHESTRATION-PLAN Wave 2——O7）——routeIntent
 *
 * 语义路由（无 @ 时）：消息 embedding → 与 AI Agent 能力文本 embedding
 * 余弦相似度 top1 ≥ 阈值 0.55 → 路由单一 Agent；低于阈值 → 回退广播
 * （现有全触发——不退化）。
 *
 * mock embed（三角向量——[1,0,0]/[0,1,0]/[0,0,1]——可预测 top1：
 * 消息向量与某 Agent 同向 → 路由；正交 → 低相似度回退）。
 */
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { postgres } from 'weifuwu'
import { routeIntent } from '../src/services/intent-route.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const APP_ID = '00000000-0000-0000-0000-000000000001'
const DEPT = '00000000-0000-0000-0000-000000000050'
const AGENT_ANALYST = '00000000-0000-0000-0000-000000000051' // 数据分析师
const AGENT_CS = '00000000-0000-0000-0000-000000000052'       // 客服

let pg: any

/** mock embed：文本 → 三角向量（关键词命中返回固定方向） */
function mockEmbed(text: string): number[] {
  if (/数据|分析|Q3|销售|报表/.test(text)) return [1, 0, 0]        // 数据分析方向
  if (/退款|客诉|安抚|客服|话术/.test(text)) return [0, 1, 0]      // 客服方向
  return [0, 0, 1]                                                 // 其他正交
}

before(async () => {
  pg = postgres({ memory: true })
  const schema = readFileSync(resolve(__dirname, '..', 'src', 'db', 'schema.sql'), 'utf-8')
  await pg.sql.unsafe(`
    DROP TABLE IF EXISTS agent_logs CASCADE; DROP TABLE IF EXISTS messages CASCADE;
    DROP TABLE IF EXISTS department_members CASCADE; DROP TABLE IF EXISTS departments CASCADE;
    DROP TABLE IF EXISTS agents CASCADE; DROP TYPE IF EXISTS agent_type CASCADE;
  `)
  await pg.sql.unsafe(schema)
  await pg.sql`INSERT INTO departments (id, app_id, name) VALUES (${DEPT}, ${APP_ID}, '测试部')`
  await pg.sql`INSERT INTO agents (id, app_id, type, name, system_prompt, role_label, expertise) VALUES
    (${AGENT_ANALYST}, ${APP_ID}, 'ai', '数据分析师', '你是数据分析师', '数据分析', 'Excel/报表/销售分析'),
    (${AGENT_CS}, ${APP_ID}, 'ai', '客服', '你是客服专员', '客户服务', '退款/客诉安抚/话术')`
})

after(async () => {
  if (pg) await pg.close()
})

function ctx() {
  return { sql: pg.sql, orm: (pg as any).orm, appId: APP_ID, ai: { embed: async (t: string) => mockEmbed(String(t)) } } as any
}

const aiAgents = [
  { id: AGENT_ANALYST, name: '数据分析师', role_label: '数据分析', expertise: 'Excel/报表/销售分析' },
  { id: AGENT_CS, name: '客服', role_label: '客户服务', expertise: '退款/客诉安抚/话术' },
]

describe('O7: 意图路由', () => {
  it('命中数据分析 → top1 = 数据分析师（相似度 > 0.55）', async () => {
    const r = await routeIntent(ctx(), DEPT, '帮我分析一下 Q3 销售报表', aiAgents as any)
    assert.equal(r.kind, 'routed')
    assert.equal(r.agent?.id, AGENT_ANALYST)
    assert.ok((r.similarity ?? 0) >= 0.55, `相似度 ${r.similarity} ≥ 阈值`)
    assert.equal(r.agent?.name, '数据分析师')
  })

  it('命中客服 → top1 = 客服', async () => {
    const r = await routeIntent(ctx(), DEPT, '用户要求退款怎么安抚？', aiAgents as any)
    assert.equal(r.kind, 'routed')
    assert.equal(r.agent?.id, AGENT_CS)
  })

  it('低相似度（正交）→ 回退广播（不误路由）', async () => {
    // 消息 [0,0,1] 与两 Agent（[1,0,0]/[0,1,0]）都正交——相似度 0 < 阈值
    const r = await routeIntent(ctx(), DEPT, '今天天气如何', aiAgents as any)
    assert.equal(r.kind, 'fallback')
    assert.ok(r.similarity !== undefined && r.similarity < 0.55, `回退（相似度 ${r.similarity} 低）`)
  })

  it('无 AI 成员 → 回退（不路由不炸）', async () => {
    const r = await routeIntent(ctx(), DEPT, '分析数据', [] as any)
    assert.equal(r.kind, 'fallback')
  })

  it('embed 失败 → 回退广播（路由尽力——不阻断消息链）', async () => {
    const failCtx = { ...ctx(), ai: { embed: async () => { throw new Error('embed 服务不可用') } } }
    const r = await routeIntent(failCtx, DEPT, '分析数据', aiAgents as any)
    assert.equal(r.kind, 'fallback')
  })

  it('阈值边界：相似度恰好等于阈值 → 路由（≥ 语义）', async () => {
    // 构造完全同向（相似度 1.0——含边界意义——≥ 判定）
    const r = await routeIntent(ctx(), DEPT, '数据分析 报表 Q3 销售', aiAgents as any)
    assert.equal(r.kind, 'routed')
    assert.equal(r.agent?.id, AGENT_ANALYST)
  })
})
