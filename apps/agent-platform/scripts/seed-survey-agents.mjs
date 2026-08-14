/**
 * 模拟数据收集——10 个不同人设的 AI Agent 批量创建
 *
 * 用途：客户 demo（模拟数据收集——10 个角色各自访问问卷页填写并提交）。
 * 每个 Agent 有独立人设（行业/岗位/偏好）→ 回答天然差异化。
 *
 * 用法：node --env-file=.env scripts/seed-survey-agents.mjs
 * 前置：登录（admin@demo.com）→ 自动建部门（模拟调研组）+ 建 10 个 AI + 绑成员
 */

const BASE = process.env.PUBLIC_BASE_URL ?? 'http://localhost:3000'
const EMAIL = process.env.SEED_EMAIL ?? 'admin@demo.com'
const PASSWORD = process.env.SEED_PASSWORD ?? 'admin123'

const PERSONAS = [
  { name: '财务小王', roleLabel: '财务视角', expertise: '成本/预算/ROI', prompt: '你是财务部的小王，35 岁，关注成本与预算。填问卷时：对价格敏感，倾向低分，反馈聚焦性价比与 ROI。回答简洁务实。' },
  { name: '市场小李', roleLabel: '市场视角', expertise: '品牌/渠道/增长', prompt: '你是市场部的小李，28 岁，关注品牌与增长。填问卷时：乐观积极，给高分，反馈聚焦品牌传播与市场活动。语气热情。' },
  { name: '产品老张', roleLabel: '产品视角', expertise: '体验/功能/roadmap', prompt: '你是产品经理老张，38 岁，关注体验与功能。填问卷时：评分中等偏上，反馈聚焦易用性与功能缺口，给具体改进建议。' },
  { name: '客服小陈', roleLabel: '客服视角', expertise: '售后/响应/满意度', prompt: '你是客服主管小陈，30 岁，关注售后响应。填问卷时：评分取决于售后体验的想象，反馈聚焦响应速度与服务态度。' },
  { name: '研发大刘', roleLabel: '技术视角', expertise: '性能/安全/架构', prompt: '你是技术负责人大刘，40 岁，关注性能与安全。填问卷时：评分保守（3-4），反馈聚焦技术稳定性、安全性与性能指标。' },
  { name: '人事小周', roleLabel: 'HR 视角', expertise: '制度/培训/文化', prompt: '你是 HR 小周，32 岁，关注制度与培训。填问卷时：中性评分，反馈聚焦培训支持与制度清晰度。语气温和。' },
  { name: '销售阿强', roleLabel: '销售视角', expertise: '客户/渠道/成交', prompt: '你是销售总监阿强，42 岁，关注客户反馈与成交。填问卷时：给高分（维护关系心态），反馈聚焦客户痛点与销售支持。' },
  { name: '运营小赵', roleLabel: '运营视角', expertise: '数据/流程/效率', prompt: '你是运营小赵，27 岁，关注数据与效率。填问卷时：评分中等，反馈聚焦数据看板与流程效率，给具体数据建议。' },
  { name: '行政陈姐', roleLabel: '行政视角', expertise: '后勤/合规/流程', prompt: '你是行政主管陈姐，45 岁，关注合规与流程。填问卷时：评分中性偏稳，反馈聚焦流程规范与后勤支持。' },
  { name: '实习生阿泽', roleLabel: '新人视角', expertise: '上手/引导/文档', prompt: '你是实习生阿泽，22 岁，刚入职。填问卷时：评分看上手体验，反馈聚焦新人引导与文档质量。语气青涩真诚。' },
]

async function api(path, opts = {}) {
  const res = await fetch(BASE + path, {
    ...opts,
    body: opts.body === undefined ? undefined : (typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body)),
    headers: { 'Content-Type': 'application/json', ...(opts.headers ?? {}) },
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`${path}: ${data.error ?? res.status}`)
  return data
}

async function main() {
  // 登录
  const login = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: EMAIL, password: PASSWORD }) })
  const appLogin = await api('/api/auth/apps/demo/login', {
    method: 'POST',
    headers: { Authorization: `Bearer ${login.token}` },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  })
  const token = appLogin.token
  const auth = { Authorization: `Bearer ${token}` }

  // 建部门（模拟调研组）
  const deptName = '模拟调研组'
  const depts = await api('/api/departments', { headers: auth })
  let dept = depts.departments.find((d) => d.name === deptName)
  if (!dept) {
    const d = await api('/api/departments', { method: 'POST', headers: auth, body: JSON.stringify({ name: deptName }) })
    dept = d.department ?? d
    console.log(`✅ 部门已创建：${dept.name}`)
  } else {
    console.log(`✅ 部门已存在：${dept.name}`)
  }

  // 建 10 个角色 Agent（人设各异 + 网络权限——浏览器填写需要）
  const agents = await api('/api/agents', { headers: auth })
  const existingNames = new Set(agents.agents.map((a) => a.name))
  let created = 0
  for (const p of PERSONAS) {
    if (existingNames.has(p.name)) { console.log(`⏭ 已存在：${p.name}`); continue }
    const body = {
      type: 'ai', name: p.name, description: `${p.roleLabel}——${p.expertise}`,
      role_label: p.roleLabel, expertise: p.expertise,
      system_prompt: p.prompt,
      allow_file_tools: true, allow_command_exec: true, allow_network: true,
      human_in_the_loop: false,
    }
    const createdAgent = await api('/api/agents', { method: 'POST', headers: auth, body })
    const agent = createdAgent.agent ?? createdAgent
    // 绑到部门
    await api(`/api/departments/${dept.id}/members`, { method: 'POST', headers: auth, body: JSON.stringify({ agent_id: agent.id }) }).catch((e) => console.log(`  ⚠️ 绑定失败 ${p.name}: ${e.message}`))
    created++
    console.log(`✅ 已创建并入组：${p.name}（${p.roleLabel}）`)
  }
  console.log(`\n完成：本次创建 ${created} 个 · 部门「${dept.name}」现有 ${dept.member_count ?? '?'} 名成员`)
  console.log(`问卷页：${BASE}/demo-survey（AI 从容器内访问 http://host.docker.internal:3000/demo-survey）`)
}

main().catch((e) => { console.error('失败:', e.message); process.exit(1) })
