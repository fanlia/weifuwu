/**
 * Agent 管理页交互测试（UI-ROLE-TEST-PLAN Wave 2——2026-08）
 *
 * 用户教训：表单「填写→提交→列表出现」才暴露链路 bug——本测试固化：
 * - /agents/new 创建表单（直接创建——跳过模板）→ 提交 → 详情页
 * - /agents 列表显示新建 Agent + 删除（确认）
 * - viewer：建 Agent 403/隐藏（requireWriter）
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import {
  startAgentServer, openAgentPage, registerTenant, injectAuth, apiAs,
  seedRoleMember, waitForBodyText, waitForText,
  type AgentServer, type TenantAuth,
} from './shared.ts'

let server: AgentServer
let browser: Browser
let BASE = ''
let owner: TenantAuth

test.before(async () => {
  server = await startAgentServer()
  BASE = server.base
  browser = await chromium.launch()
  owner = await registerTenant(BASE, 'agents')
})

test.after(async () => {
  await browser?.close()
  server?.stop()
})

test('创建 Agent：跳过模板 → 配置表单 → 提交 → 详情页（交互链路）', async () => {
  const page = await browser.newPage()
  await injectAuth(page, owner)
  await openAgentPage(page, BASE, '/agents/new')
  await waitForBodyText(page, /创建 Agent/)
  // 跳过模板（直接创建）
  await page.click('text=跳过模板，直接创建')
  await waitForBodyText(page, /Agent 名称|名称/)
  // 填名称（找输入框——placeholder 含名称）
  await page.fill('input[placeholder*="名称"], input[placeholder*="name"]', '交互测试AI')
  const submit = page.locator('button:has-text("创建")').first()
  assert.ok((await submit.count()) > 0, '创建按钮存在')
  await submit.click()
  // 提交后跳详情（/agents/:id——页面含 Agent 名称）
  await waitForBodyText(page, /交互测试AI/, 10_000)
  assert.ok(/\/agents\/[0-9a-f-]{8,}/.test(page.url()), `URL 进详情：${page.url()}`)
  await page.close()
})

test('Agent 列表：显示新建 Agent + 删除（确认）', async () => {
  // 种子（API 快路径）——再 UI 删除
  const agent = await apiAs(BASE, owner, '/api/agents', {
    method: 'POST', body: JSON.stringify({ type: 'ai', name: '待删Agent', description: '删除测试' }),
  })
  const agentId = agent.agent.id
  const page = await browser.newPage()
  await injectAuth(page, owner)
  await openAgentPage(page, BASE, '/agents')
  await waitForText(page, '待删Agent')
  // 删除按钮（danger——可能确认弹窗）
  const del = page.locator(`button:has-text("删除")`).first()
  await del.click()
  // 等待确认弹窗/直接删除——断言列表更新
  const confirmBtn = page.locator('button:has-text("确定")').first()
  if ((await confirmBtn.count()) > 0) await confirmBtn.click()
  // 删除后列表刷新（重试轮询）
  await page.waitForFunction(
    () => !(document.body.textContent ?? '').includes('待删Agent'),
    '删除后列表不含',
    { timeout: 10_000 },
  )
  // API 确认
  const list = await apiAs(BASE, owner, '/api/agents')
  assert.ok(!(list.agents ?? []).some((a: any) => a.id === agentId), 'API 确认删除')
  await page.close()
})

test('viewer：建 Agent 被拒（服务端 403——requireWriter）', async () => {
  const viewer = await seedRoleMember(BASE, owner, 'viewer')
  let status403 = false
  try {
    await apiAs(BASE, viewer, '/api/agents', {
      method: 'POST', body: JSON.stringify({ type: 'ai', name: 'viewerAgent', description: 'x' }),
    })
  } catch (e: any) {
    status403 = String(e.message).includes('403')
  }
  assert.ok(status403, 'viewer 建 Agent API 应 403')
  // 前端：new 页可开但提交被拒（或按钮禁用）——只需 API 红线（前端已测 workspace）
  const page = await browser.newPage()
  await injectAuth(page, viewer)
  await openAgentPage(page, BASE, '/agents/new')
  await waitForBodyText(page, /创建 Agent/)
  // 页面可看（只读=可见表单？——红线在提交）——断言不崩
  await page.close()
})
