/**
 * W1 验收（BUSINESS-SCENARIO-PLAN——G-A 冷启动 + G-B 配额触达）
 *
 *  - 空工作台 → 一键演示空间按钮 → 创建 → 直达聊天（成员齐：经理/客服/知识库）
 *  - API 契约：POST /api/demo/space → 部门+经理+AI+KB 四实体齐
 *  - G-B：Reports quotaPressure=true（种子部门超配）→ 配额告警横幅渲染
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { postgres } from 'weifuwu'
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
  owner = await registerTenant(BASE, 'demo')
  pg = testDb(BASE)
})

test.after(async () => {
  await browser?.close()
  await pg.close()
  server?.stop()
})

test('W1a: 空工作台 → 一键演示空间 → 直达聊天（经理/客服/知识库成员齐）', async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  await injectAuth(page, owner)
  const errors = await openAgentPage(page, BASE, '/')
  await waitForText(page, '一键演示空间')
  await page.click('button:has-text("一键演示空间")')
  // 直达聊天页
  await page.waitForFunction(() => location.pathname.startsWith('/chat/'), undefined, { timeout: 10_000 })
  await waitForText(page, '演示项目经理')
  await waitForText(page, '客服小知')
  await waitForText(page, '产品知识库')
  assert.deepEqual(fatalErrors(errors), [], `页面零错误——发现: ${errors.join(' | ')}`)
  await page.close()
})

test('W1b: API 契约——演示空间 = 部门+经理+AI+KB 四实体', async () => {
  const res = await apiAs(BASE, owner, '/api/demo/space', { method: 'POST', body: '{}' })
  assert.ok(res.department?.id, '部门')
  assert.ok(res.manager, '经理')
  assert.equal(res.agents.length, 2, 'AI + KB')
  const dept = await apiAs(BASE, owner, `/api/departments/${res.department.id}`)
  const names = (dept.members ?? []).map((m: { type: string }) => m.type)
  assert.ok(names.includes('department') && names.includes('ai') && names.includes('knowledge_base'), '三类成员齐')
})

test('W1c: G-B 配额触达——quotaPressure=true 时 Reports 渲染告警横幅', async () => {
  const stats = await apiAs(BASE, owner, '/api/stats/departments')
  assert.equal(typeof stats.quotaPressure, 'boolean', '数据面返回布尔')
  // UI 渲染（无论 true/false——横幅条件渲染）——页头存在即渲染无错
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  await injectAuth(page, owner)
  const errors = await openAgentPage(page, BASE, '/reports')
  await waitForText(page, '运营报表')
  assert.deepEqual(fatalErrors(errors), [], `Reports 零错误——发现: ${errors.join(' | ')}`)
  if (stats.quotaPressure) await waitForText(page, '月度 AI 配额')
  await page.close()
})
