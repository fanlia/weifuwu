/**
 * CHAT-UX 波次 2 防线：布局与一致性（L1-L4）
 *
 * - L1 左栏贴顶满高：wf-row 默认 align-items:center 使 aside 垂直居中悬浮
 *   （顶差 121px 实测）——wf-self-stretch 拉伸后 top/height 与行容器一致
 * - L3 翻页工具条：loadOlder 与 loadMessages 同源 parseStoredTools——
 *   首屏 50 条之外的历史 AI 消息工具步骤条恢复（旧代码 spread 原始消息丢工具条）
 * - L4 面板按钮响应式：`wf-flex wf-hidden@lg` 宽隐窄显——根因两层（Button
 *   忽略 class prop→C3 已修；@layer 下 utilities 输 components→hidden 变体
 *   !important 已修）——桌面 1280 必须隐藏 + 移动 390 必须显示可点
 *
 * 锁定契约见每断言注释。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import {
  startAgentServer, openAgentPage, registerTenant, injectAuth, apiAs, fatalErrors,
  type AgentServer, type TenantAuth,
  testDb,
} from './shared.ts'

let server: AgentServer
let browser: Browser
let BASE = ''
let owner: TenantAuth
let deptId = ''
let agentId = ''

test.before(async () => {
  server = await startAgentServer()
  BASE = server.base
  browser = await chromium.launch()
  owner = await registerTenant(BASE, 'wave2')
  const dept = await apiAs(BASE, owner, '/api/departments', { method: 'POST', body: JSON.stringify({ name: '波次二部' }) })
  deptId = dept.department.id
  const agent = await apiAs(BASE, owner, '/api/agents', {
    method: 'POST',
    body: JSON.stringify({ name: '波次二AI', type: 'ai', system_prompt: '测试' }),
  })
  agentId = agent.agent.id ?? agent.id
})

test.after(async () => {
  await browser?.close()
  server?.stop()
})

/** SQL 直插消息（审批测试既有先例——直连测试库） */
async function seedMessage(content: string, senderType: string, aiStep?: object): Promise<void> {
  const { postgres } = await import('weifuwu')
  const pg = testDb(BASE)
  try {
    await pg.sql`
      INSERT INTO messages (department_id, sender_id, content, msg_type, ai_step)
      VALUES (${deptId}::uuid, ${agentId}::uuid, ${content}, ${senderType}, ${aiStep ? JSON.stringify(aiStep) : null})
    `
  } finally {
    await pg.close()
  }
}

test('L1+L4 1280px：左栏贴顶满高 + 面板按钮桌面隐藏（hidden@lg !important——组件 display 压不住）', async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  await injectAuth(page, owner)
  const errors = await openAgentPage(page, BASE, `/chat/${deptId}`)
  await page.waitForFunction(() => (document.body.textContent ?? '').includes('波次二部'), undefined, { timeout: 10_000 })
  const state = await page.evaluate(() => {
    const aside = document.querySelector('.ap-panel-drawer')
    const row = aside?.parentElement
    const btn = document.querySelector('button[aria-label="打开成员与交付物面板"]')
    return {
      asideTop: aside ? Math.round(aside.getBoundingClientRect().top) : -1,
      rowTop: row ? Math.round(row.getBoundingClientRect().top) : -2,
      asideH: aside ? Math.round(aside.getBoundingClientRect().height) : -1,
      rowH: row ? Math.round(row.getBoundingClientRect().height) : -2,
      btnDisplay: btn ? getComputedStyle(btn).display : 'gone',
    }
  })
  // L1：wf-self-stretch——aside 与行容器同顶同高（旧形态顶差 121px）
  assert.equal(state.asideTop, state.rowTop, `左栏应贴顶（aside ${state.asideTop} vs row ${state.rowTop}）`)
  assert.equal(state.asideH, state.rowH, `左栏应满高（aside ${state.asideH} vs row ${state.rowH}）`)
  // L4：hidden@lg !important——桌面隐藏（.wf-btn display:inline-flex 在 components 层曾无条件压过）
  assert.equal(state.btnDisplay, 'none', `桌面 1280 面板按钮应隐藏，实际 ${state.btnDisplay}`)
  assert.ok(fatalErrors(errors).length === 0, `页面零错误红线: ${errors.join(' | ')}`)
  await page.close()
})

test('L4 390px：面板按钮显示可点（宽隐窄显组合回归——旧 CSS 顺序/层叠下曾失效）', async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
  await injectAuth(page, owner)
  const errors = await openAgentPage(page, BASE, `/chat/${deptId}`)
  await page.waitForFunction(() => (document.body.textContent ?? '').includes('波次二部'), undefined, { timeout: 10_000 })
  await page.click('button[aria-label="打开成员与交付物面板"]')
  await page.waitForFunction(() => document.querySelector('.ap-panel-drawer')?.classList.contains('ap-drawer--open'), undefined, { timeout: 5000 })
  const panelText = await page.evaluate(() => document.querySelector('.ap-panel-drawer')?.textContent ?? '')
  assert.ok(panelText.includes('成员'), '面板应含成员区')
  await page.close()
})

test('L3 翻页工具条：加载更早后历史 AI 消息的工具步骤恢复（parseStoredTools 同源）', async () => {
  // 种 52 条：最旧 1 条 AI 带 ai_step（翻页后才可见）+ 50 条普通（占满首屏）
  await seedMessage('历史工具消息', 'ai', { steps: [{ tool: 'read_file', args: { path: 'README.md' }, ok: true, result: '内容' }] })
  for (let i = 0; i < 50; i++) await seedMessage(`填充消息 ${i}`, 'text')
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  await injectAuth(page, owner)
  const errors = await openAgentPage(page, BASE, `/chat/${deptId}`)
  await page.waitForFunction(() => (document.body.textContent ?? '').includes('填充消息'), undefined, { timeout: 10_000 })
  // 首屏不含历史工具消息（只加载最近 50 条）
  const beforeHas = await page.evaluate(() => (document.body.textContent ?? '').includes('历史工具消息'))
  assert.ok(!beforeHas, '首屏不应包含 50 条之前的历史消息')
  // 滚动到顶触发「加载更早」
  await page.evaluate(() => {
    const scroller = document.querySelector('.wf-overflow-auto')
    if (scroller instanceof HTMLElement) scroller.scrollTop = 0
    scroller?.dispatchEvent(new Event('scroll', { bubbles: true }))
  })
  await page.waitForFunction(() => (document.body.textContent ?? '').includes('历史工具消息'), undefined, { timeout: 10_000 })
  // 断言：历史 AI 消息带工具 pill（parseStoredTools 生效——旧代码丢工具条）
  const pillShown = await page.evaluate(() => {
    const msgs = [...document.querySelectorAll('[data-msgid]')]
    const target = msgs.find((m) => (m.textContent ?? '').includes('历史工具消息'))
    return target ? target.querySelectorAll('.wf-pill').length > 0 : false
  })
  assert.ok(pillShown, '翻页加载的历史 AI 消息应恢复工具步骤条（wf-pill）')
  assert.ok(fatalErrors(errors).length === 0, `页面零错误红线: ${errors.join(' | ')}`)
  await page.close()
})
