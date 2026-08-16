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

import { PERSONAS, GROUP_NAME, GROUP_ROLES, buildSurveyPrompt, SURVEY_URL } from './survey-agents-lib.mjs'

const BASE = process.env.PUBLIC_BASE_URL ?? 'http://localhost:3000'
const EMAIL = process.env.SEED_EMAIL ?? 'admin@demo.com'
const PASSWORD = process.env.SEED_PASSWORD ?? 'admin123'

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
    } else if (!agent.department_id) {
      // 存量角色（无 department_id）——补挂执行归属部门
      const updated = await api(`/api/agents/${agent.id}`, { method: 'PUT', headers: auth, body: { department_id: deptId } })
      agent = updated.agent ?? agent
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
