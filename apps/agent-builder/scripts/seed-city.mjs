/**
 * 城市模拟世界 seed——代表原型模式（蓝图场景四——100 万人城市的分层最小）
 * 用法：node --env-file=.env scripts/seed-city.mjs（需 server 已启动）
 *
 * 代表原型（weight = 代表人数）——政策事件 → 各群体立场评估——
 * 宏观方程（L0）为后续迭代（当前 = 代表原型的 LLM 评估）。
 */
const BASE = process.env.PUBLIC_BASE_URL ?? 'http://localhost:3400'
const WORLD_NAME = process.argv[2] ?? '城市模拟'

const GROUPS = [
  { name: '产业工人', persona: '制造业工人——收入中等，房贷压力大，关注就业稳定与物价。', weight: 250000 },
  { name: '白领职员', persona: '写字楼白领——收入中上，通勤时间长，关注生活品质与教育。', weight: 180000 },
  { name: '小店主', persona: '个体商户——经营压力大，关注税收与租金。', weight: 60000 },
  { name: '大学生', persona: '在校学生——消费敏感，关注就业前景与城市活力。', weight: 90000 },
  { name: '退休老人', persona: '退休居民——养老金生活，关注医疗与公交便利。', weight: 150000 },
  { name: '医护人员', persona: '医院工作者——工作强度大，关注医疗资源与待遇。', weight: 40000 },
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

const { world } = await api('/api/worlds', { method: 'POST', body: { name: WORLD_NAME, type: 'city' } })
console.log(`✓ 世界「${world.name}」（${world.id}）`)

for (const g of GROUPS) {
  const { agent } = await api(`/api/worlds/${world.id}/agents`, {
    method: 'POST', body: { name: g.name, persona: g.persona, capabilities: ['speak'], weight: g.weight },
  })
  console.log(`  ✓ 代表：${g.name}（${g.weight} 人）`)
}

const { event } = await api(`/api/worlds/${world.id}/events`, {
  method: 'POST',
  body: { type: 'policy', payload: { description: '市政府提案：地铁 5 号线建设 + 沿线区域限行（缓解拥堵）——请评估这项政策对你的影响。' } },
})
console.log(`✓ 政策事件已注入（${event.id}）——各群体代表评估中`)
console.log(`\n打开 http://localhost:3400/worlds/${world.id} 查看民意图谱（weight = 节点大小）`)
