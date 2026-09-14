/**
 * 部门管理页交互测试（UI-ROLE-TEST-PLAN Wave 2——2026-08）
 *
 * 固化：创建部门表单（名称+选成员）→ 提交 → 列表出现 → 详情页文件区 → 删除
 * - member 建部门 403（requireDeptManager 之外——建部门 requireWriter + ？）
 * - viewer 403
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
  owner = await registerTenant(BASE, 'depts')
})

test.after(async () => {
  await browser?.close()
  server?.stop()
})

test('创建部门：表单（名称+成员勾选）→ 提交 → 列表出现（交互链路）', async () => {
  const page = await browser.newPage()
  await injectAuth(page, owner)
  await openAgentPage(page, BASE, '/departments/new')
  await waitForBodyText(page, /创建部门/)
  await page.fill('input[placeholder*="技术部"]', '交互测试部')
  // 至少一个成员可勾选（owner 注册自建 user agent）——点 label（checkbox 隐藏 input）
  const memberLabels = page.locator('form label:has(span), label:has(input[type=checkbox])')
  const n = await memberLabels.count()
  if (n > 0) await memberLabels.first().click()
  await page.click('button:has-text("创建部门")')
  await waitForText(page, '交互测试部', 10_000)
  assert.ok(page.url().includes('/departments'), `URL 回列表：${page.url()}`)
  await page.close()
})

test('部门列表→ 详情页：文件区 + 工作区写文件（交互/API 混合）', async () => {
  // 种子部门
  const dept = await apiAs(BASE, owner, '/api/departments', { method: 'POST', body: JSON.stringify({ name: '详情部门' }) })
  const deptId = dept.department.id
  await apiAs(BASE, owner, `/api/departments/${deptId}/workspace/file`, {
    method: 'PUT', body: JSON.stringify({ path: 'dept-file.md', content: '# 部门文件' }),
  })
  const page = await browser.newPage()
  await injectAuth(page, owner)
  await openAgentPage(page, BASE, `/departments/${deptId}`)
  await waitForBodyText(page, /详情部门/)
  // 文件区显示（工作区文件）
  await waitForText(page, 'dept-file.md', 10_000)
  await page.close()
})

test('删除部门：列表删除按钮 → 确认 → 从列表消失', async () => {
  const dept = await apiAs(BASE, owner, '/api/departments', { method: 'POST', body: JSON.stringify({ name: '待删部门' }) })
  const page = await browser.newPage()
  await injectAuth(page, owner)
  await openAgentPage(page, BASE, '/departments')
  await waitForText(page, '待删部门')
  await page.locator('button:has-text("删除")').first().click()
  const confirmBtn = page.locator('button:has-text("确定")').first()
  if ((await confirmBtn.count()) > 0) await confirmBtn.click()
  // 删除含沙盒清理——等待列表刷新（重试轮询——不固定 sleep）
  await page.waitForFunction(
    () => !(document.body.textContent ?? '').includes('待删部门'),
    '删除后列表不含',
    { timeout: 15_000 },
  )
  await page.close()
})

test('成员/ viewer 建部门 403（角色能力边界）', async () => {
  const viewer = await seedRoleMember(BASE, owner, 'viewer')
  let v403 = false
  try {
    await apiAs(BASE, viewer, '/api/departments', { method: 'POST', body: JSON.stringify({ name: 'v-dept' }) })
  } catch (e: any) { v403 = String(e.message).includes('403') }
  assert.ok(v403, 'viewer 建部门 403')
  // member 建部门（能力矩阵：建部门 owner/admin——member 应 403）
  const member = await seedRoleMember(BASE, owner, 'member')
  let m403 = false
  try {
    await apiAs(BASE, member, '/api/departments', { method: 'POST', body: JSON.stringify({ name: 'm-dept' }) })
  } catch (e: any) { m403 = String(e.message).includes('403') }
  assert.ok(m403, 'member 建部门 403（矩阵：member 无建部门）')
})
