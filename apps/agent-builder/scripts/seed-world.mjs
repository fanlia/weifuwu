/**
 * 红楼梦推演世界 seed——产品演示形态
 * 用法：node --env-file=.env scripts/seed-world.mjs（需 server 已启动——走 API）
 *
 * 8 人物 + 关系图谱（爱情/亲情/主仆/汇报/同盟）——蓝图场景二的落地示例：
 * 以红楼梦前 80 回人物为蓝本推演后续发展。
 */
const BASE = process.env.PUBLIC_BASE_URL ?? 'http://localhost:3400'

const WORLD_NAME = process.argv[2] ?? '红楼梦推演'

const CHARACTERS = [
  { name: '贾宝玉', persona: '怡红公子——厌恶仕途经济，多情善感，怜香惜玉，认定"女儿是水做的骨肉"。', caps: ['speak'] },
  { name: '林黛玉', persona: '潇湘妃子——孤高敏感，才华横溢，多愁善感，言语尖刻但心地纯真。', caps: ['speak'] },
  { name: '薛宝钗', persona: '蘅芜君——端庄大方，深谙世故，通达人情，处事圆融。', caps: ['speak'] },
  { name: '贾母', persona: '荣国府老太君——慈爱睿智，家族掌舵人，疼爱孙辈，威仪与温情并重。', caps: ['speak'] },
  { name: '王熙凤', persona: '凤辣子——精明泼辣，持家有道，八面玲珑，笑里藏刀。', caps: ['speak'] },
  { name: '贾政', persona: '荣国府老爷——严苛正统，望子成龙，重仕途功名，威严少语。', caps: ['speak'] },
  { name: '袭人', persona: '宝玉首席大丫鬟——温顺忠诚，体贴周全，一心为主子打算。', caps: ['speak'] },
  { name: '晴雯', persona: '芙蓉女儿——率直刚烈，心灵手巧，心高气傲，不阿谀逢迎。', caps: ['speak'] },
]

const RELATIONS = [
  { from: '贾宝玉', to: '林黛玉', type: '爱情', strength: 5 },
  { from: '贾宝玉', to: '薛宝钗', type: '爱情', strength: 3 },
  { from: '贾母', to: '贾宝玉', type: '亲情', strength: 4 },
  { from: '贾母', to: '林黛玉', type: '亲情', strength: 3 },
  { from: '贾政', to: '贾宝玉', type: '亲情', strength: 2 },
  { from: '王熙凤', to: '贾母', type: '汇报', strength: 2, directed: true },
  { from: '袭人', to: '贾宝玉', type: '主仆', strength: 3 },
  { from: '晴雯', to: '贾宝玉', type: '主仆', strength: 2 },
  { from: '林黛玉', to: '薛宝钗', type: '同盟', strength: 1 },
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

// 同名世界已存在则跳过（幂等）
const existing = await api('/api/worlds')
if (existing.worlds?.some((w) => w.name === WORLD_NAME)) {
  console.log(`世界「${WORLD_NAME}」已存在——跳过`)
  process.exit(0)
}

const { world } = await api('/api/worlds', { method: 'POST', body: { name: WORLD_NAME, type: 'narrative' } })
console.log(`✓ 世界「${world.name}」（${world.id}）`)

const ids = new Map()
for (const c of CHARACTERS) {
  const { agent } = await api(`/api/worlds/${world.id}/agents`, {
    method: 'POST', body: { name: c.name, persona: c.persona, capabilities: c.caps },
  })
  ids.set(c.name, agent.id)
  console.log(`  ✓ 角色：${c.name}`)
}

for (const r of RELATIONS) {
  const { relation } = await api(`/api/worlds/${world.id}/relations`, {
    method: 'POST',
    body: { from: ids.get(r.from), to: ids.get(r.to), type: r.type, strength: r.strength, directed: !!r.directed },
  })
  console.log(`  ✓ 关系：${r.from} ${r.directed ? '→' : '⇄'} ${r.to}（${r.type}·${r.strength}）`)
}

// 注入推演起点事件（第 80 回末尾——宝玉婚事将定）
const { event } = await api(`/api/worlds/${world.id}/events`, {
  method: 'POST',
  body: {
    type: 'plot',
    payload: { description: '第 80 回末：宝玉婚事将定——金玉良缘之说渐盛，黛玉病势缠绵，阖府气氛微妙。请以你的身份回应这一局势。' },
  },
})
console.log(`✓ 推演起点事件已注入（${event.id}）——回合引擎运行中（轮询世界详情可见叙事流）`)
console.log(`\n打开 http://localhost:3400/worlds/${world.id} 查看图谱与叙事流`)
