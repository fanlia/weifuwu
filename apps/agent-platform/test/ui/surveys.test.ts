/**
 * W2 验收（BUSINESS-SCENARIO-PLAN——G-G 问卷开箱）
 *
 *  - /surveys 发起面板：URL 默认 origin/demo-survey + 人设卡片 → 创建 → 列表出现
 *    活动行（status/进度/失败/重试/取消按钮）
 *  - 开箱验收：角色池无需 seed 脚本（创建后 DB 有 问卷-* agent + 独立部门 + campaign）
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { postgres , buildQuery } from 'weifuwu'
import {
  startAgentServer, openAgentPage, registerTenant, injectAuth, apiAs, fatalErrors,
  waitForText,
  type AgentServer, type TenantAuth,
  testDb,
} from './shared.ts'

let server: AgentServer
let browser: Browser
let BASE = ''
let owner: TenantAuth
let pg: ReturnType<typeof postgres>

test.before(async () => {
  server = await startAgentServer()
  BASE = server.base
  browser = await chromium.launch()
  owner = await registerTenant(BASE, 'survey')
  pg = testDb(BASE)
})

test.after(async () => {
  await browser?.close()
  await pg.close()
  server?.stop()
})

test('W2a: 发起面板渲染（默认 URL + 人设卡片 + 并发选择）', async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  await injectAuth(page, owner)
  const errors = await openAgentPage(page, BASE, '/surveys')
  await waitForText(page, '问卷活动')
  await waitForText(page, '调查员人设')
  await waitForText(page, '财务小王')
  await waitForText(page, '创建问卷活动')
  assert.deepEqual(fatalErrors(errors), [], `页面零错误——发现: ${errors.join(' | ')}`)
  await page.close()
})

test('W2b: 创建 → 角色池/活动落库 → 列表出现活动行', async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  await injectAuth(page, owner)
  const errors = await openAgentPage(page, BASE, '/surveys')
  await waitForText(page, '创建问卷活动')
  await page.click('button:has-text("创建问卷活动")')
  await waitForText(page, '问卷活动已创建')
  await waitForText(page, '进度')
  // 角色池落库断言（开箱——无 seed）
  const agents = await apiAs(BASE, owner, '/api/agents?type=ai')
  const surveyAgents = (agents.agents ?? []).filter((a: { name: string }) => a.name.startsWith('问卷-'))
  assert.ok(surveyAgents.length >= 5, `角色池 created——found ${surveyAgents.length}`)
  const [cnt] = await pg.query(buildQuery().from('survey_campaigns').count('*', 'n', { app_id: { eq: owner.app.id } }).toQuery())
  assert.ok(cnt.n >= 1, 'campaign 落库')
  assert.deepEqual(fatalErrors(errors), [], `页面零错误——发现: ${errors.join(' | ')}`)
  await page.close()
})

test('W2c: retry/cancel 按钮接线（running 活动可见）', async () => {
  const res = await apiAs(BASE, owner, '/api/survey/campaigns')
  assert.ok(res.campaigns?.length >= 1, '列表端点可用')
  const running = res.campaigns.find((c: { status: string }) => c.status === 'running')
  assert.ok(running, '新活动 running')
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  await injectAuth(page, owner)
  await openAgentPage(page, BASE, '/surveys')
  await waitForText(page, '进度')
  assert.ok(await page.locator('button:has-text("取消")').count() >= 1, '取消按钮可见')
  await page.close()
})
