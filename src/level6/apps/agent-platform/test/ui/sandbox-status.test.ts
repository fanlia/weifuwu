/**
 * 沙盒状态诚实化测试（UX-PLAN-2 波次 1 防线）
 *
 * 旧实证 bug（走查 + DOM 取证）：
 * 1. 双标签——StatusDot 自带默认文案「运行中/已暂停」，Sandboxes/DepartmentDetail
 *    调用不传 label 又另起 span 渲染 STATUS_LABEL → 卡片同时显示「● 运行中 待启动」
 * 2. 误导点色——statusTone('requested') = true → 容器未启动的沙盒亮绿点
 *    （绿 = 运行语义——用户误以为沙盒在跑）
 *
 * 锁定契约：
 * - requested 沙盒卡片：单标签「待启动」，无「运行中」字样
 * - requested 点色为灰（Badge dot --default）——非绿（--success）
 * - DepartmentDetail 环境卡同断言
 * - 惰性创建（POST /api/sandboxes 只落记录不起容器——零 docker 开销）
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
  owner = await registerTenant(BASE, 'sbx-status')
})

test.after(async () => {
  await browser?.close()
  server?.stop()
})

/** 种子：部门 + 绑定沙盒（requested——惰性，无容器） */
async function seedSandbox(name: string): Promise<{ deptId: string; sbxId: string }> {
  const dept = await apiAs(BASE, owner, '/api/departments', { method: 'POST', body: JSON.stringify({ name: `${name}部` }) })
  const deptId = dept.department.id
  const sbx = await apiAs(BASE, owner, '/api/sandboxes', {
    method: 'POST',
    body: JSON.stringify({ department_id: deptId, name }),
  })
  const sbxId = sbx.sandbox?.id ?? sbx.id
  assert.ok(sbxId, `沙盒创建响应缺 id: ${JSON.stringify(sbx).slice(0, 200)}`)
  return { deptId, sbxId }
}

test('API 形状：POST /api/sandboxes 惰性创建——status=requested（语义源头）', async () => {
  const { sbxId } = await seedSandbox('惰性状态')
  const detail = await apiAs(BASE, owner, `/api/sandboxes/${sbxId}`)
  const row = detail.sandbox ?? detail
  assert.equal(row.status, 'requested', '惰性创建必须落 requested（不起容器）')
})

test('/sandboxes 列表：requested 卡片单标签「待启动」+ 灰点（无双标签无绿点）', async () => {
  await seedSandbox('单标签检查')
  const page = await browser.newPage()
  await injectAuth(page, owner)
  const errors = await openAgentPage(page, BASE, '/sandboxes')
  // 卡片渲染（等沙盒名出现）
  await page.waitForFunction(() => (document.body.textContent ?? '').includes('单标签检查'), undefined, { timeout: 10_000 })
  // 定位含该沙盒名的卡片——其文本必须含「待启动」且不含「运行中」
  const cardText = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('.wf-card')]
    const card = cards.find((c) => (c.textContent ?? '').includes('单标签检查'))
    return card ? card.textContent ?? '' : null
  })
  assert.ok(cardText, '沙盒卡片未渲染')
  assert.ok(cardText.includes('待启动'), `卡片应有「待启动」标签，实际：${cardText.slice(0, 200)}`)
  assert.ok(!cardText.includes('运行中'), `双标签回归！卡片不应出现「运行中」：${cardText.slice(0, 200)}`)
  // 点色：卡片内 badge dot 必须是 --default（灰）——非 --success（绿）
  const dotVariant = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('.wf-card')]
    const card = cards.find((c) => (c.textContent ?? '').includes('单标签检查'))
    const dot = card?.querySelector('[class*="wf-badge-dot"]')
    return dot ? [...dot.classList].find((c) => c.startsWith('wf-badge-dot--')) ?? '' : 'no-dot'
  })
  assert.equal(dotVariant, 'wf-badge-dot--default', `requested 点色必须灰（default），实际：${dotVariant}`)
  assert.ok(fatalErrors(errors).length === 0, `页面零错误红线: ${errors.join(' | ')}`)
  await page.close()
})

test('/departments/:id 环境卡：requested 单标签「待启动（首次工具调用时自动启动）」', async () => {
  const { deptId } = await seedSandbox('详情环境')
  const page = await browser.newPage()
  await injectAuth(page, owner)
  const errors = await openAgentPage(page, BASE, `/departments/${deptId}`)
  await page.waitForFunction(() => (document.body.textContent ?? '').includes('待启动'), undefined, { timeout: 10_000 })
  // 沙盒卡片区（#sec-sandbox）——单标签断言
  const sectionText = await page.evaluate(() => document.getElementById('sec-sandbox')?.textContent ?? '')
  assert.ok(sectionText.includes('待启动（首次工具调用时自动启动）'), `环境卡应有待启动文案：${sectionText.slice(0, 200)}`)
  assert.ok(!sectionText.includes('运行中'), `双标签回归！环境卡不应出现「运行中」：${sectionText.slice(0, 200)}`)
  assert.ok(fatalErrors(errors).length === 0, `页面零错误红线: ${errors.join(' | ')}`)
  await page.close()
})

test('Agents 列表：活跃 Agent 显式「运行中」标签（label 显式传入——不依赖组件默认文案）', async () => {
  await apiAs(BASE, owner, '/api/agents', {
    method: 'POST',
    body: JSON.stringify({ name: '状态标签Agent', type: 'ai', system_prompt: '测试' }),
  })
  const page = await browser.newPage()
  await injectAuth(page, owner)
  await openAgentPage(page, BASE, '/agents')
  await page.waitForFunction(() => (document.body.textContent ?? '').includes('状态标签Agent'), undefined, { timeout: 10_000 })
  const cardText = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('.wf-card')]
    const card = cards.find((c) => (c.textContent ?? '').includes('状态标签Agent'))
    return card ? card.textContent ?? '' : null
  })
  assert.ok(cardText, 'Agent 卡片未渲染')
  assert.ok(cardText.includes('运行中'), `活跃 Agent 卡片应显式显示「运行中」：${cardText.slice(0, 200)}`)
  await page.close()
})
