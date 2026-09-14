/**
 * 会话列表去噪测试（UX-PLAN-2 波次 2 防线）——单 AI 待命间识别
 *
 * 实证：seed 建的 0 人类成员部门（研发大刘/客服小陈等 5 个）在会话/工作台
 * 列表显示「暂无消息，发一条试试」——引导用户发消息（错的第一步：非成员
 * 发消息前应先把自己加进空间）。
 *
 * 锁定契约：
 * - /api/departments 返回 human_count（人类成员数——语义源头）
 * - 待命间（human_count=0）：卡片文案「AI 待命间 · 加入后开聊」+「N AI」，
 *   点击直达部门详情（成员管理）——不进聊天
 * - 加入后：卡片恢复正常文案 + 点击进聊天
 * - 种子全走真实 API（建部门 → 移除自己 → 加回——不 SQL 直插）
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import {
  startAgentServer, openAgentPage, registerTenant, injectAuth, apiAs, fatalErrors,
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
  owner = await registerTenant(BASE, 'standby')
})

test.after(async () => {
  await browser?.close()
  server?.stop()
})

/** 种子：建部门（创建者+自动经理入伙）→ 移除创建者（剩纯 AI——待命间） */
async function seedStandbyDept(name: string): Promise<string> {
  const dept = await apiAs(BASE, owner, '/api/departments', { method: 'POST', body: JSON.stringify({ name }) })
  const deptId = dept.department.id
  const agents = await apiAs(BASE, owner, '/api/agents')
  const me = (agents.agents ?? []).find((a: any) => a.type === 'user')
  assert.ok(me, '注册租户必有 user agent')
  await apiAs(BASE, owner, `/api/departments/${deptId}/members/${me.id}`, { method: 'DELETE' })
  return deptId
}

/** 把创建者加回部门（恢复可聊） */
async function rejoinDept(deptId: string): Promise<void> {
  const agents = await apiAs(BASE, owner, '/api/agents')
  const me = (agents.agents ?? []).find((a: any) => a.type === 'user')
  await apiAs(BASE, owner, `/api/departments/${deptId}/members`, {
    method: 'POST', body: JSON.stringify({ agent_id: me.id, role: 'admin' }),
  })
}

test('API：human_count 语义源——建部门 1 → 移除自己 0 → 加回 1', async () => {
  const dept = await apiAs(BASE, owner, '/api/departments', { method: 'POST', body: JSON.stringify({ name: '计数部门' }) })
  const deptId = dept.department.id
  const list1 = await apiAs(BASE, owner, '/api/departments')
  const d1 = list1.departments.find((x: any) => x.id === deptId)
  assert.equal(d1.human_count, 1, '创建者自动入伙——human_count=1')
  const agents = await apiAs(BASE, owner, '/api/agents')
  const me = (agents.agents ?? []).find((a: any) => a.type === 'user')
  await apiAs(BASE, owner, `/api/departments/${deptId}/members/${me.id}`, { method: 'DELETE' })
  const list2 = await apiAs(BASE, owner, '/api/departments')
  const d2 = list2.departments.find((x: any) => x.id === deptId)
  assert.equal(d2.human_count, 0, '移除自己后 human_count=0（待命间）')
  assert.equal(d2.member_count >= 1, true, '部门经理仍在——member_count≥1')
  await rejoinDept(deptId)
  const list3 = await apiAs(BASE, owner, '/api/departments')
  const d3 = list3.departments.find((x: any) => x.id === deptId)
  assert.equal(d3.human_count, 1, '加回后 human_count=1')
})

test('/chat/new：待命间卡片「AI 待命间 · 加入后开聊」+ 点击直达部门详情', async () => {
  const deptId = await seedStandbyDept('待命检查部')
  const page = await browser.newPage()
  await injectAuth(page, owner)
  const errors = await openAgentPage(page, BASE, '/chat/new')
  await page.waitForFunction(() => (document.body.textContent ?? '').includes('待命检查部'), undefined, { timeout: 10_000 })
  const cardText = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('.wf-card')]
    const card = cards.find((c) => (c.textContent ?? '').includes('待命检查部'))
    return card ? card.textContent ?? '' : null
  })
  assert.ok(cardText, '待命间卡片未渲染')
  assert.ok(cardText.includes('AI 待命间 · 加入后开聊'), `待命间文案缺失：${cardText.slice(0, 200)}`)
  assert.ok(cardText.includes('AI'), `成员数应显示 AI 形态（N AI）：${cardText.slice(0, 200)}`)
  assert.ok(!cardText.includes('发一条试试'), `待命间不应引导发消息：${cardText.slice(0, 200)}`)
  // 点击直达部门详情（成员管理）——不进聊天
  await page.locator('.wf-card', { hasText: '待命检查部' }).click()
  await page.waitForURL(/\/departments\/[0-9a-f-]+$/, { timeout: 10_000 })
  assert.ok(!page.url().includes('/chat/'), `待命间点击不应进聊天：${page.url()}`)
  assert.ok(fatalErrors(errors).length === 0, `页面零错误红线: ${errors.join(' | ')}`)
  await page.close()
})

test('/chat/new：加入后卡片恢复「发一条试试」+ 点击进聊天', async () => {
  const deptId = await seedStandbyDept('回归检查部')
  await rejoinDept(deptId)
  const page = await browser.newPage()
  await injectAuth(page, owner)
  await openAgentPage(page, BASE, '/chat/new')
  await page.waitForFunction(() => (document.body.textContent ?? '').includes('回归检查部'), undefined, { timeout: 10_000 })
  const cardText = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('.wf-card')]
    const card = cards.find((c) => (c.textContent ?? '').includes('回归检查部'))
    return card ? card.textContent ?? '' : null
  })
  assert.ok(cardText?.includes('暂无消息，发一条试试'), `正常部门文案恢复：${cardText?.slice(0, 200)}`)
  assert.ok(!cardText?.includes('待命间'), `有人类成员不应显示待命间：${cardText?.slice(0, 200)}`)
  await page.locator('.wf-card', { hasText: '回归检查部' }).click()
  await page.waitForURL(new RegExp(`/chat/${deptId}`), { timeout: 10_000 })
  await page.close()
})

test('/ 工作台：待命间卡片同语义（去噪覆盖两入口）', async () => {
  await seedStandbyDept('工作台待命部')
  const page = await browser.newPage()
  await injectAuth(page, owner)
  const errors = await openAgentPage(page, BASE, '/')
  await page.waitForFunction(() => (document.body.textContent ?? '').includes('工作台待命部'), undefined, { timeout: 10_000 })
  const cardText = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('.wf-card')]
    const card = cards.find((c) => (c.textContent ?? '').includes('工作台待命部'))
    return card ? card.textContent ?? '' : null
  })
  assert.ok(cardText, '工作台卡片未渲染')
  assert.ok(cardText.includes('AI 待命间 · 加入后开聊'), `工作台待命间文案缺失：${cardText.slice(0, 200)}`)
  assert.ok(!cardText.includes('@AI 成员开始干活'), `待命间不应引导 @AI（人还没进群）：${cardText.slice(0, 200)}`)
  assert.ok(fatalErrors(errors).length === 0, `页面零错误红线: ${errors.join(' | ')}`)
  await page.close()
})
