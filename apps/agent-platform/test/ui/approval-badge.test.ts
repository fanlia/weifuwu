/**
 * 审批徽章测试（UX-PLAN-2 波次 4 防线）——侧边栏审批待办全局可见性
 *
 * 实证：工作台黄条「有 N 条 AI 草稿待你批准」只在首页可见——用户在其它
 * 页面（聊天/Agent/沙盒）干活时审批到达零感知。
 *
 * 锁定契约：
 * - 无待审批：侧边栏无徽章
 * - 种子草稿后导航：徽章出现（数字 = pending 数）
 * - 批准后导航：徽章消失
 * - 时机：挂载 + 导航拉取（无轮询定时器）
 * - 草稿种子：SQL 直插（审批测试既有先例——不走真实 LLM）
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import {
  startAgentServer, openAgentPage, registerTenant, injectAuth, apiAs,
  type AgentServer, type TenantAuth,
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
  owner = await registerTenant(BASE, 'badge')
  const dept = await apiAs(BASE, owner, '/api/departments', { method: 'POST', body: JSON.stringify({ name: '徽章部门' }) })
  deptId = dept.department.id
  const agent = await apiAs(BASE, owner, '/api/agents', {
    method: 'POST',
    body: JSON.stringify({ name: '徽章AI', type: 'ai', system_prompt: '测试' }),
  })
  agentId = agent.agent.id ?? agent.id
})

test.after(async () => {
  await browser?.close()
  server?.stop()
})

/** 种子待审草稿（SQL 直插——审批测试既有先例） */
async function seedDraft(content: string): Promise<string> {
  const { postgres } = await import('weifuwu')
  const pg = postgres(process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL, { max: 5 })
  try {
    const [msg] = await pg.sql`
      INSERT INTO messages (department_id, sender_id, content, msg_type, ai_draft, ai_approved)
      VALUES (${deptId}::uuid, ${agentId}::uuid, ${content}, 'text', ${content}, NULL)
      RETURNING id
    `
    return String(msg.id)
  } finally {
    await pg.close()
  }
}

/** 侧边栏审批徽章读数（null = 无徽章） */
async function badgeText(page: import('playwright').Page): Promise<string | null> {
  return page.evaluate(() => {
    const badge = document.querySelector('.wf-sidebar .ap-nav-badge')
    return badge ? (badge.textContent ?? '').trim() : null
  })
}

test('无待审批：侧边栏无徽章（零误报——徽章只在该出现时出现）', async () => {
  const page = await browser.newPage()
  await injectAuth(page, owner)
  await openAgentPage(page, BASE, '/agents')
  await page.waitForTimeout(1500) // 挂载拉取完成窗口
  assert.equal(await badgeText(page), null, '无 pending 时不应有徽章')
  await page.close()
})

test('种子草稿 → 导航 → 徽章出现（数字=pending 数）→ 批准后导航 → 徽章消失', async () => {
  const msgId = await seedDraft('徽章草稿一')
  const page = await browser.newPage()
  await injectAuth(page, owner)
  await openAgentPage(page, BASE, '/agents')
  // 挂载拉取（草稿已存在——首拉即见）
  await page.waitForFunction(() => !!document.querySelector('.wf-sidebar .ap-nav-badge'), undefined, { timeout: 10_000 })
  assert.equal(await badgeText(page), '1', '徽章应显示 1')
  // 导航（Menu onSelect 拉取路径）→ 徽章保持
  await page.click('.wf-sidebar .wf-menu-item:has-text("沙盒")')
  await page.waitForURL(/\/sandboxes/, { timeout: 10_000 })
  await page.waitForFunction(() => !!document.querySelector('.wf-sidebar .ap-nav-badge'), undefined, { timeout: 10_000 })
  assert.equal(await badgeText(page), '1', '导航后徽章保持 1')
  // API 批准草稿 → 导航回 → 徽章消失
  await apiAs(BASE, owner, `/api/messages/${msgId}/approve`, { method: 'POST', body: JSON.stringify({ approved: true }) })
  await page.click('.wf-sidebar .wf-menu-item:has-text("Agent")')
  await page.waitForURL(/\/agents/, { timeout: 10_000 })
  await page.waitForFunction(() => !document.querySelector('.wf-sidebar .ap-nav-badge'), undefined, { timeout: 10_000 })
  assert.equal(await badgeText(page), null, '批准后徽章应消失')
  await page.close()
})

test('两条草稿 → 徽章显示 2（计数非布尔）', async () => {
  await seedDraft('徽章草稿二')
  await seedDraft('徽章草稿三')
  const page = await browser.newPage()
  await injectAuth(page, owner)
  await openAgentPage(page, BASE, '/reports')
  await page.waitForFunction(
    () => document.querySelector('.wf-sidebar .ap-nav-badge')?.textContent?.trim() === '2',
    undefined, { timeout: 10_000 },
  )
  await page.close()
})
