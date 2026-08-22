/**
 * AI 公司世界 seed——经营模式示例（蓝图场景三）
 * 用法：node --env-file=.env scripts/seed-company.mjs（需 server 已启动）
 *
 * 组织树（汇报边）+ 周期事件推进——每个岗位按职责行动/决策/汇报。
 */
const BASE = process.env.PUBLIC_BASE_URL ?? 'http://localhost:3400'
const WORLD_NAME = process.argv[2] ?? 'AI 公司模拟'

const ROLES = [
  { name: 'CEO 张总', persona: '首席执行官——结果导向，关注增长与现金流，果断敢决。', caps: ['speak'] },
  { name: 'CFO 李财务', persona: '首席财务官——严守预算，现金流第一，风险厌恶。', caps: ['speak'] },
  { name: 'CTO 王技术', persona: '首席技术官——技术债焦虑，追求架构稳健与交付质量。', caps: ['speak'] },
  { name: 'CMO 赵市场', persona: '首席市场官——增长激进，信奉品牌与投放，乐观。', caps: ['speak'] },
  { name: 'HR 陈人事', persona: '人力资源总监——关注组织健康、员工士气的稳定器。', caps: ['speak'] },
]

const REPORTS = [
  { from: 'CFO 李财务', to: 'CEO 张总', type: '汇报', strength: 3, directed: true },
  { from: 'CTO 王技术', to: 'CEO 张总', type: '汇报', strength: 3, directed: true },
  { from: 'CMO 赵市场', to: 'CEO 张总', type: '汇报', strength: 3, directed: true },
  { from: 'HR 陈人事', to: 'CEO 张总', type: '汇报', strength: 2, directed: true },
  { from: 'CMO 赵市场', to: 'CFO 李财务', type: '协作', strength: 2 },
  { from: 'CTO 王技术', to: 'CFO 李财务', type: '协作', strength: 1 },
]

async function api(path, opts = {}) {
  const res = await fetch(BASE + path, {
    method: opts.method ?? 'GET',
    headers: { 'Content-Type': 'application/json' },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`${path}: ${data.error ?? res.status}`)
  return data
}

const existing = await api('/api/worlds')
if (existing.worlds?.some((w) => w.name === WORLD_NAME)) {
  console.log(`世界「${WORLD_NAME}」已存在——跳过`)
  process.exit(0)
}

const { world } = await api('/api/worlds', { method: 'POST', body: { name: WORLD_NAME, type: 'company' } })
console.log(`✓ 世界「${world.name}」（${world.id}）`)

const ids = new Map()
for (const r of ROLES) {
  const { agent } = await api(`/api/worlds/${world.id}/agents`, { method: 'POST', body: { name: r.name, persona: r.persona, capabilities: r.caps } })
  ids.set(r.name, agent.id)
  console.log(`  ✓ 角色：${r.name}`)
}
for (const r of REPORTS) {
  const { relation } = await api(`/api/worlds/${world.id}/relations`, {
    method: 'POST', body: { from: ids.get(r.from), to: ids.get(r.to), type: r.type, strength: r.strength, directed: true },
  })
  console.log(`  ✓ 关系：${r.from} → ${r.to}（${r.type}）`)
}

// 周期 1：外部事件
const { event } = await api(`/api/worlds/${world.id}/events`, {
  method: 'POST',
  body: { type: 'cycle', payload: { description: 'Q2 开始：市场增长放缓 20%，现金流吃紧——请各岗位给出本周期行动与决策。' } },
})
console.log(`✓ 周期事件已注入（${event.id}）——回合运行中`)
console.log(`\n打开 http://localhost:3400/worlds/${world.id} 查看经营回合（可再注入下一周期事件推进）`)
