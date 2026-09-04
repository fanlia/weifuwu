/**
 * 六业务场景旅程冒烟（BUSINESS-SCENARIO-PLAN W0——白盒基线）
 *
 * 每场景一条快乐路径（真实 server + playwright + 真实 API——LLM 依赖不测——既定纪律）：
 *  - J1 知识+客服：建部门 → 加 AI/KB 成员 → 聊天页成员与输入面可见
 *  - J2 IM 群客服：webhook agent → 详情页入站端点/测试/平台面可见 + 测试请求 API 通
 *  - J3 数据车间：交付物页空态 + 聊天工作区/文件区渲染
 *  - J4 多 agent 编排：Reports 编排任务链渲染（API 种子 agent_runs）
 *  - J5 问卷：campaign API 旅程（create → progress）——UI 缺失留 W2 证据
 *  - J6 私有化：compose 配置契约（服务 + healthcheck）——全量上云 W7 验证
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, type Browser } from 'playwright'
import { postgres } from 'weifuwu'
import {
  startAgentServer, openAgentPage, registerTenant, injectAuth, apiAs, fatalErrors,
  waitForText,
  type AgentServer, type TenantAuth,
  testDb,
} from './shared.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const APP_ROOT = join(__dirname, '..', '..')

let server: AgentServer
let browser: Browser
let BASE = ''
let owner: TenantAuth
let pg: ReturnType<typeof postgres>

test.before(async () => {
  server = await startAgentServer()
  BASE = server.base
  browser = await chromium.launch()
  owner = await registerTenant(BASE, 'scenario')
  pg = testDb(BASE)
})

test.after(async () => {
  await browser?.close()
  await pg.close()
  server?.stop()
})

// ── J1 企业内部知识+客服一体化 ────────────────────────────
test('J1: 建部门 → 加 AI/KB 成员 → 聊天页成员齐 + 输入面可用（无 LLM 断言）', async () => {
  const dept = await apiAs(BASE, owner, '/api/departments', { method: 'POST', body: JSON.stringify({ name: '客户成功部' }) })
  const deptId = dept.department.id
  const kb = await apiAs(BASE, owner, '/api/agents', { method: 'POST', body: JSON.stringify({ type: 'knowledge_base', name: '产品知识库' }) })
  const ai = await apiAs(BASE, owner, '/api/agents', { method: 'POST', body: JSON.stringify({ type: 'ai', name: '客服小知', model: 'deepseek-chat' }) })
  for (const id of [kb.agent.id, ai.agent.id]) {
    await apiAs(BASE, owner, `/api/departments/${deptId}/members`, { method: 'POST', body: JSON.stringify({ agent_id: id, role: 'member' }) })
  }
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  await injectAuth(page, owner)
  const errors = await openAgentPage(page, BASE, `/chat/${deptId}`)
  await waitForText(page, '产品知识库')
  await waitForText(page, '客服小知')
  await waitForText(page, '客户成功部经理')
  assert.deepEqual(fatalErrors(errors), [], `J1 页面零错误——发现: ${errors.join(' | ')}`)
  await page.close()
})

// ── J2 外部 IM 群客服 ─────────────────────────────────────
test('J2: webhook agent 详情——入站端点/平台/测试面 + 测试请求 API 通', async () => {
  const wh = await apiAs(BASE, owner, '/api/agents', {
    method: 'POST',
    body: JSON.stringify({ type: 'webhook', name: '企微客服', webhook_secret: 'smoke-secret' }),
  })
  const id = wh.agent.id
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  await injectAuth(page, owner)
  const errors = await openAgentPage(page, BASE, `/agents/${id}`)
  await waitForText(page, '入站端点')
  // 端点 URL 在 readonly Input 的 value（非文本节点）——按 value 断言
  await page.waitForFunction(
    (u) => [...document.querySelectorAll('input')].some(i => (i.value ?? '').includes(u)),
    `/api/webhook/${id}`,
    { timeout: 8000 },
  )
  await waitForText(page, '发送测试请求')
  await waitForText(page, '外部平台')
  assert.deepEqual(fatalErrors(errors), [], `J2 页面零错误——发现: ${errors.join(' | ')}`)
  // 测试请求（签名——复用 hmac 模式：X-Timestamp + X-Signature）
  const ts = String(Date.now())
  const { createHmac } = await import('node:crypto')
  const body = JSON.stringify({ message: { type: 'text', content: '冒烟测试' }, conversationId: `c-${Date.now()}` })
  const sig = createHmac('sha256', 'smoke-secret').update(`${ts}.${body}`).digest('hex')
  const res = await fetch(`${BASE}/api/webhook/${id}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Timestamp': ts, 'X-Signature': sig },
    body,
  })
  assert.ok(res.status === 200 || res.status === 201, `测试请求通——status ${res.status}`)
  await page.close()
})

// ── J3 AI 数据/文档车间 ───────────────────────────────────
test('J3: 交付物页空态 + 聊天工作区/文件区渲染', async () => {
  const dept = await apiAs(BASE, owner, '/api/departments', { method: 'POST', body: JSON.stringify({ name: '数据车间' }) })
  const deptId = dept.department.id
  const ai = await apiAs(BASE, owner, '/api/agents', { method: 'POST', body: JSON.stringify({ type: 'ai', name: '报表员', model: 'deepseek-chat', allow_file_tools: true }) })
  await apiAs(BASE, owner, `/api/departments/${deptId}/members`, { method: 'POST', body: JSON.stringify({ agent_id: ai.agent.id, role: 'member' }) })
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  await injectAuth(page, owner)
  const errors = await openAgentPage(page, BASE, '/deliverables')
  await waitForText(page, '交付物')
  const errors2 = await openAgentPage(page, BASE, `/chat/${deptId}`)
  await waitForText(page, '交付物（共享目录）')
  await waitForText(page, '首次干活时自动创建')
  assert.deepEqual(fatalErrors([...errors, ...errors2]), [], `J3 页面零错误——发现: ${[...errors, ...errors2].join(' | ')}`)
  await page.close()
})

// ── J3b W5（G-D）：文本产物内联预览 ───────────────────────
test('J3b: 交付物 md 产物 → 预览按钮 → 内容内联显示', async () => {
  const dept = await apiAs(BASE, owner, '/api/departments', { method: 'POST', body: JSON.stringify({ name: '预览车间' }) })
  const deptId = dept.department.id
  await apiAs(BASE, owner, `/api/departments/${deptId}/workspace/file`, {
    method: 'PUT',
    body: JSON.stringify({ path: '周报.md', content: '# 本周周报\n- 完成发布\n- 下周计划' }),
  })
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  await injectAuth(page, owner)
  const errors = await openAgentPage(page, BASE, '/deliverables')
  await waitForText(page, '周报.md')
  await page.click('button:has-text("预览")')
  await waitForText(page, '本周周报')
  await waitForText(page, '完成发布')
  assert.deepEqual(fatalErrors(errors), [], `J3b 页面零错误——发现: ${errors.join(' | ')}`)
  await page.close()
})

test('J4: 编排数据面正确 + Reports 任务链渲染（W3——G-F 修复后契约）', async () => {
  const dept = await apiAs(BASE, owner, '/api/departments', { method: 'POST', body: JSON.stringify({ name: '编排部' }) })
  const deptId = dept.department.id
  const orch = await apiAs(BASE, owner, '/api/agents', { method: 'POST', body: JSON.stringify({ type: 'ai', name: '编排经理', model: 'deepseek-chat' }) })
  await pg.sql`
    INSERT INTO agent_runs (app_id, department_id, orchestrator_id, kind, plan_json, worker_results, status)
    VALUES (${owner.app.id}, ${deptId}, ${orch.agent.id}, 'orchestration', ${JSON.stringify([{ agent: 'A' }])}, ${JSON.stringify([{ agent: '数据分析员', status: 'ok', result: '报告已产出' }])}, 'done')
  `
  const runs = await apiAs(BASE, owner, '/api/stats/runs')
  assert.ok(runs.runs?.length >= 1, '数据面返回种子任务链')
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  await injectAuth(page, owner)
  const errors = await openAgentPage(page, BASE, '/reports')
  await waitForText(page, '编排任务链')
  await waitForText(page, '编排经理')
  await waitForText(page, '数据分析员')
  await waitForText(page, '报告已产出')
  assert.deepEqual(fatalErrors(errors), [], `J4 页面零错误——发现: ${errors.join(' | ')}`)
  await page.close()
})

// ── J5 问卷 ───────────────────────────────────────────────
// 现状契约（W0 走查实证）：问卷角色需手工 seed（name LIKE '问卷-%' + 部门）——
// 无开箱路径（400「先跑 seed-survey-agents.mjs」）——缺 U 面 + 缺开箱种子 = W2 修复目标。
test('J5: campaign API 旅程——角色池创建 → 创建 → 进度查询（开箱缺口=W2 证据）', async () => {
  const dept = await apiAs(BASE, owner, '/api/departments', { method: 'POST', body: JSON.stringify({ name: '问卷部' }) })
  for (const name of ['问卷-调研A', '问卷-调研B']) {
    await apiAs(BASE, owner, '/api/agents', {
      method: 'POST',
      body: JSON.stringify({ type: 'ai', name, model: 'deepseek-chat', department_id: dept.department.id }),
    })
  }
  const res = await apiAs(BASE, owner, '/api/survey/campaigns', {
    method: 'POST',
    body: JSON.stringify({ total: 2, concurrency: 1, rolePrefix: '问卷-' }),
  })
  assert.ok(res.campaign?.id, 'campaign 创建')
  const progress = await apiAs(BASE, owner, `/api/survey/campaigns/${res.campaign.id}`)
  assert.ok(progress.progress, '进度可视（completed/failed/total）')
  assert.equal(typeof progress.progress.total, 'number')
})

// ── J6 私有化/白标交付（配置契约） ─────────────────────────
test('J6: compose 配置契约——依赖栈三服务 + healthcheck（仓库根唯一 compose——2026-09 收敛）', () => {
  // agent-platform 无独立 compose（AGENTS §7：应用本体宿主 node 跑——不 build app）
  const yml = readFileSync(join(APP_ROOT, '..', '..', 'docker-compose.yml'), 'utf-8')
  assert.match(yml, /postgres.*:/, 'postgres 服务')
  assert.match(yml, /redis.*:/, 'redis 服务')
  // 2026-10 邮件内存化：smtp/greenmail 已删——compose 仅 postgres/redis 两个依赖
  assert.doesNotMatch(yml, /smtp|greenmail/i, 'smtp 已清（Email 模块 Memory 化——compose 不再需要）')
  assert.match(yml, /healthcheck:/, 'healthcheck 接线（每服务健康探针）')
})
