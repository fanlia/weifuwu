/**
 * 模拟数据收集——10 个不同人设的 AI 角色批量创建（新架构适配 2026-12）
 *
 * 三层模型：每角色一个独立部门 = 独立沙盒 = **并发填写**（旧实现 1 部门 10 agent 在新架构
 * 下会走沙盒 exec 串行队列——浏览器任务排队数十分钟——架构不变量，按角色拆部门解决）。
 *
 * 角色流程（提示词内建）：agent-browser 打开问卷 → snapshot 读题 → fill/select/check 作答
 * → submit 提交 → 验证成功 → 结果写入部门工作目录 survey-result.json（交付物+执行验证可见）
 *
 * 用法：node --env-file=.env scripts/seed-survey-agents.mjs
 * 前置：服务启动（admin@demo.com 可登录）；问卷页 {PUBLIC_BASE_URL}/demo-survey
 */

const BASE = process.env.PUBLIC_BASE_URL ?? 'http://localhost:3000'
const EMAIL = process.env.SEED_EMAIL ?? 'admin@demo.com'
const PASSWORD = process.env.SEED_PASSWORD ?? 'admin123'
const SURVEY_URL = process.env.SURVEY_URL ?? `${BASE}/demo-survey`

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

/** 问卷填写群——5 个机器人的群组（seed 自动建好：用户进群发消息 @全员/@all，
 *  5 个机器人同时响应填写问卷——自然使用路径，无需跑 launch 派单） */
const GROUP_NAME = '问卷填写群'
const GROUP_ROLES = PERSONAS.slice(0, 5) // 财务小王/市场小李/产品老张/客服小陈/研发大刘

/** 角色执行提示词：人设 + agent-browser 填写纪律 + 结果落盘（交付物） */
function buildSurveyPrompt(p) {
  return `${p.prompt}

【问卷填写任务（模拟数据收集）】
当用户要求填写问卷时（可选工具——不强制）：
1. 用 agent-browser 打开问卷：agent-browser open "${SURVEY_URL}?s=${encodeURIComponent(p.name)}"
   ⚠️ 容器内访问：你在沙盒容器里——localhost 是容器自身（问卷连不上）——若 open localhost 失败，
   改用宿主地址 agent-browser open "http://host.docker.internal:3000/demo-survey?s=${encodeURIComponent(p.name)}"
2. agent-browser snapshot 读取题目与控件 ref——逐题作答（fill 文本 / select 下拉 / check 勾选 / click 单选与提交）
3. 按你的${p.roleLabel}作答：评分与反馈符合你的身份
4. 提交后 read/snapshot 验证成功页（「✅ 已提交」锁定态）
5. 完成后把你的作答结果写入工作目录：用 write 工具创建 survey-result.json，内容：
   {"name":"${p.name}","role":"${p.roleLabel}","submitted":true,"answers":{...逐题答案...},"verified":true}
6. 完成后执行 agent-browser close 关闭浏览器会话

【工具说明】agent-browser 是浏览器操作工具（真实网页导航/快照/填写/点击）——
仅在需要真实浏览器操作时使用（如填写问卷）；普通对话/咨询直接回复即可——
不强制调用任何工具。

【产物纪律】survey-result.json 是本次任务的交付物——写入后工作目录可见。`
}

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
  const login = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: EMAIL, password: PASSWORD }) })
  const appLogin = await api('/api/auth/apps/demo/login', {
    method: 'POST', headers: { Authorization: `Bearer ${login.token}` }, body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  })
  const token = appLogin.token
  const auth = { Authorization: `Bearer ${token}` }

  const depts = await api('/api/departments', { headers: auth })
  const existingDepts = new Map(depts.departments.map((d) => [d.name, d.id]))
  const agents = await api('/api/agents', { headers: auth })
  const existingAgents = new Map(agents.agents.map((a) => [a.name, a]))

  // 「问卷填写群」——5 个机器人的群组（seed 自动建好——用户进群发消息 @全员 → 全部填写问卷）
  let groupDeptId = existingDepts.get(GROUP_NAME)
  if (!groupDeptId) {
    const d = await api('/api/departments', { method: 'POST', headers: auth, body: JSON.stringify({ name: GROUP_NAME, auto_manager: false }) })
    groupDeptId = d.department.id
    existingDepts.set(GROUP_NAME, groupDeptId)
  }

  // 「问卷调研」部门——用户在部门里发消息（@全员 或 @角色）让大家填写（自然使用路径）
  let hubDeptId = existingDepts.get('问卷调研')
  if (!hubDeptId) {
    const d = await api('/api/departments', { method: 'POST', headers: auth, body: JSON.stringify({ name: '问卷调研', auto_manager: false }) })
    hubDeptId = d.department.id
    existingDepts.set('问卷调研', hubDeptId)
  }

  let created = 0
  for (const p of PERSONAS) {
    // 1) 角色部门（每角色独立部门 = 独立沙盒——并发填写）
    let deptId = existingDepts.get(p.name)
    if (!deptId) {
      const d = await api('/api/departments', { method: 'POST', headers: auth, body: JSON.stringify({ name: p.name, auto_manager: false }) })
      deptId = d.department.id
      existingDepts.set(p.name, deptId)
    }
    // 2) 角色 agent（人设 + 网络权限——浏览器填写）
    let agent = existingAgents.get(p.name)
    if (!agent) {
      const a = await api('/api/agents', { method: 'POST', headers: auth, body: {
        type: 'ai', name: p.name, description: `${p.roleLabel}——${p.expertise}`,
        role_label: p.roleLabel, expertise: p.expertise,
        system_prompt: buildSurveyPrompt(p),
        allow_file_tools: true, allow_command_exec: true, allow_network: true,
        human_in_the_loop: false,
        // 执行归属：角色在自己的独立部门干活（在问卷调研被 @ 时工具走自己的沙盒——并发）
        department_id: deptId,
      } })
      agent = a.agent ?? a
      existingAgents.set(p.name, agent)
    } else {
      // 已存在角色——更新 system_prompt（agent-browser 改可选工具后 prompt 已变——
      // 复用不更新会保留旧强制版——普通对话被逼去开浏览器）
      const updated = await api(`/api/agents/${agent.id}`, { method: 'PUT', headers: auth, body: { system_prompt: buildSurveyPrompt(p), department_id: agent.department_id ?? deptId } })
      agent = updated.agent ?? agent
      console.log(`  ↻ ${p.name} prompt 已更新（agent-browser 可选工具）`)
    }
    // 3) 入组：角色自己的部门 + 问卷调研（用户发消息的入口）
    await api(`/api/departments/${deptId}/members`, { method: 'POST', headers: auth, body: JSON.stringify({ agent_id: agent.id }) })
      .catch((e) => console.log(`  ⚠️ 入组失败 ${p.name}: ${e.message}`))
    await api(`/api/departments/${hubDeptId}/members`, { method: 'POST', headers: auth, body: JSON.stringify({ agent_id: agent.id }) })
      .catch((e) => console.log(`  ⚠️ 入问卷调研失败 ${p.name}: ${e.message}`))
    // 群组 5 机器人入「问卷填写群」
    if (GROUP_ROLES.some((r) => r.name === p.name)) {
      await api(`/api/departments/${groupDeptId}/members`, { method: 'POST', headers: auth, body: JSON.stringify({ agent_id: agent.id }) })
        .catch((e) => console.log(`  ⚠️ 入问卷填写群失败 ${p.name}: ${e.message}`))
    }
    created++
    console.log(`✅ ${p.name}（${p.roleLabel}）——角色部门=${deptId.slice(0, 8)} agent=${String(agent.id).slice(0, 8)} 已入「问卷调研」`)
  }

  console.log(`\n完成：${created} 个角色部门 + agent（每角色独立沙盒——并发填写）`)
  console.log(`问卷页：${SURVEY_URL}`)
  console.log(`\n【问卷填写群（seed 自动建好——5 个机器人）】`)
  console.log(`进入「${GROUP_NAME}」→ 发消息 @全员 请填写问卷——${GROUP_ROLES.length} 个机器人同时响应（各自独立沙盒并发）——无需跑 launch 派单`)
  console.log(`\n【10 角色批量派单（可选）】`)
  console.log(`POST /demo-survey/launch 或进入「问卷调研」部门发消息 @全员——10 个角色同时响应`)
  console.log(`汇总：node --env-file=.env scripts/survey-summary.mjs`)
}

main().catch((e) => { console.error('失败:', e.message); process.exit(1) })
