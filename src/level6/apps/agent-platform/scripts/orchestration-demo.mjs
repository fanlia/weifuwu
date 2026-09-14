#!/usr/bin/env node
/**
 * 智能编排真实链路验收（ORCHESTRATION-PLAN O6——一次性手动验证——不进 npm test）
 *
 * 为什么不进套件：真实 LLM 调用慢（10-60s）+ 输出不确定——测试纪律
 * （全库无真实 LLM 测试——contract 层 mock AI 已锁定编排逻辑 O1-O5）。
 * 本脚本验证「真实对话 → plan_tasks 被 LLM 识别调用 → 子任务并行 →
 * 汇总」——人工跑一次确认链路通（需要 DEEPSEEK_API_KEY）。
 *
 * 用法：node --env-file=.env scripts/orchestration-demo.mjs
 */
import { spawn } from 'node:child_process'

const PORT = Number(process.env.PORT ?? 3000)
const BASE = `http://localhost:${PORT}`

console.log('⚠️  需要本地服务运行中（npm run dev）——或本脚本自动拉起（未实现——手动）')
console.log('跳过自动拉起——请先确认服务在 ' + BASE)

const stamp = Date.now()
const email = `orch-demo-${stamp}@e2e.test`

async function api(path, opts = {}, token = '') {
  const res = await fetch(BASE + path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(opts.headers ?? {}) },
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`${path} ${res.status}: ${text.slice(0, 200)}`)
  return text ? JSON.parse(text) : null
}

// 1. 注册租户（一步签发）
const reg = await api('/api/auth/register', {
  method: 'POST',
  body: JSON.stringify({ email, password: 'Test123456', name: '编排演示', appSlug: `orch-${stamp}` }),
})
const token = reg.token
console.log('✔ 租户注册')

// 2. 创建专业 Agent（数据分析师 / 客服）
const mkAgent = async (name, prompt) => {
  const r = await api('/api/agents', { method: 'POST', body: JSON.stringify({ type: 'ai', name, system_prompt: prompt }) }, token)
  return r.agent.id
}
const analystId = await mkAgent('数据分析师', '你是数据分析专家——擅长解读数据、给出结论与建议。')
const csId = await mkAgent('客服', '你是客服专员——擅长整理话术、安抚用户、解答常见问题。')
const orchId = await mkAgent('编排Agent', '你是任务编排者——复杂任务用 plan_tasks 拆解并行分派；简单任务直接回答。')
console.log('✔ 创建 Agent：数据分析师 / 客服 / 编排Agent')

// 3. 创建部门 + 加入编排 Agent + 数据分析师 + 客服（member_ids 创建时传）
const dept = await api('/api/departments', {
  method: 'POST',
  body: JSON.stringify({ name: '编排演示部', member_ids: [analystId, csId, orchId] }),
}, token)
const deptId = dept.department.id
console.log('✔ 部门创建 + 成员加入')

// 4. 发送复杂任务（触发编排——真实 LLM 调用）
console.log('⏳ 发送复杂任务——编排 Agent 应调用 plan_tasks 并行拆解……')
const msg = await api(`/api/departments/${deptId}/messages`, {
  method: 'POST',
  body: JSON.stringify({ content: `@编排Agent 请完成两项调研：1) 分析 Q3 销售下滑的 3 个可能原因；2) 整理 5 条常见退款客诉的安抚话术。各写 100 字总结。` }),
}, token)
const messageId = msg.id ?? msg.message?.id
console.log('✔ 消息已发送 id=' + messageId)

// 5. 轮询执行日志（agent_logs 链——编排 Agent 应有 plan_tasks 工具调用步骤）
console.log('⏳ 等待编排执行（真实 LLM——约 30-90s）……')
let done = false
for (let i = 0; i < 30; i++) {
  await new Promise((r) => setTimeout(r, 5000))
  try {
    const logs = await api(`/api/stats/agents/${orchId}/logs`, {}, token)
    const rows = logs.logs ?? []
    if (rows.length > 0 && !!rows[0].success) { done = true; break }
  } catch { /* 日志未就绪 */ }
}
if (!done) {
  console.error('✖ 编排执行超时——请检查服务日志（DEEPSEEK key/网络）')
  process.exit(1)
}

// 6. 验证子任务产出（worker agent_logs 也应落库）
const [analystLogs, csLogs] = await Promise.all([
  api(`/api/stats/agents/${analystId}/logs`, {}, token),
  api(`/api/stats/agents/${csId}/logs`, {}, token),
])
console.log('✔ 编排 Agent 执行完成')
console.log(`  - 数据分析师 runs: ${(analystLogs.logs ?? []).length}（>0 = 子任务真实执行）`)
console.log(`  - 客服 runs: ${(csLogs.logs ?? []).length}（>0 = 子任务真实执行）`)
if ((analystLogs.logs ?? []).length === 0 || (csLogs.logs ?? []).length === 0) {
  console.error('✖ 子任务未执行——plan_tasks 未被调用（或目标 Agent 未加入部门）')
  process.exit(1)
}
console.log('✅ 编排链路验证通过：复杂任务 → plan_tasks 并行拆解 → 子 Agent 真实产出 → 汇总')
console.log('（审计：编排 Agent + 各子 Agent 均有 agent_logs——任务树链路完整）')
