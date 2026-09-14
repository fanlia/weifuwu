/**
 * CHAT-INTERACTION 波次 1：无效部门显式错误态（P2——走查实测踩中）
 *
 * 无效/截断 deptId 直开 /chat/:id → API 404（探针确认语义正确）→
 * 前端不再静默吞成「成员（0）暂无 AI 成员」误导空态——渲染显式错误态
 * （「部门不存在或无权访问」+ 返回会话列表按钮）。
 * 有效空部门（AI 待命间）的真空态文案不受影响（回归）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import {
  startAgentServer, openAgentPage, registerTenant, injectAuth, fatalErrors,
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
  owner = await registerTenant(BASE, 'c404')
})

test.after(async () => {
  await browser?.close()
  server?.stop()
})

test('无效 deptId 直开：显式错误态「部门不存在或无权访问」+ 返回按钮可用', async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  await injectAuth(page, owner)
  const errors = await openAgentPage(page, BASE, '/chat/00000000-0000-0000-0000-000000000000')
  await page.waitForFunction(() => (document.body.textContent ?? '').includes('部门不存在'), undefined, { timeout: 10_000 })
  const state = await page.evaluate(() => {
    const t = document.body.textContent ?? ''
    return {
      misleading: t.includes('暂无 AI 成员——聊天中 @ 不到人'),
      hasBack: [...document.querySelectorAll('button')].some((b) => (b.textContent ?? '').includes('返回会话列表')),
    }
  })
  assert.equal(state.misleading, false, '不应再渲染误导性空态文案（404 被静默吞的旧行为）')
  assert.ok(state.hasBack, '错误态应有「返回会话列表」出口')
  // 返回按钮可用（导航到会话列表）
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => (b.textContent ?? '').includes('返回会话列表'))
    btn?.click()
  })
  await page.waitForFunction(() => location.pathname.includes('/chat/new'), undefined, { timeout: 5000 })
  assert.ok(fatalErrors(errors).length === 0, `零页面错误: ${errors.join(' | ')}`)
  await page.close()
})

test('截断 deptId（走查踩中形态）：同样落入错误态而非空态', async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  await injectAuth(page, owner)
  await openAgentPage(page, BASE, '/chat/181db67b')
  await page.waitForFunction(() => (document.body.textContent ?? '').includes('部门不存在'), undefined, { timeout: 10_000 })
  const misleading = await page.evaluate(() => (document.body.textContent ?? '').includes('暂无 AI 成员——聊天中 @ 不到人'))
  assert.equal(misleading, false, '截断 id 不应显示「暂无 AI 成员」空态')
  await page.close()
})

test('真空态回归：待命间语义不受影响（空部门仍渲染正常聊天面）', async () => {
  // owner 建一个空部门（无 AI）——真空态
  const d = await fetch(`${BASE}/api/departments`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${owner.token}` },
    body: JSON.stringify({ name: '波次1空部门' }),
  }).then((r) => r.json())
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  await injectAuth(page, owner)
  const errors = await openAgentPage(page, BASE, `/chat/${d.department.id}`)
  await page.waitForFunction(() => !!document.querySelector('input[placeholder*="输入消息"]'), undefined, { timeout: 10_000 })
  const state = await page.evaluate(() => ({
    missing: (document.body.textContent ?? '').includes('部门不存在'),
    hasInput: !!document.querySelector('input[placeholder*="输入消息"]'),
  }))
  assert.equal(state.missing, false, '有效部门不应误报错误态')
  assert.ok(state.hasInput, '空部门仍渲染聊天输入面（真空态 ≠ 404）')
  assert.ok(fatalErrors(errors).length === 0, `零页面错误: ${errors.join(' | ')}`)
  await page.close()
})
