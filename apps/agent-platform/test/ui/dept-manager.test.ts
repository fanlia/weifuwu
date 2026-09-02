/**
 * 部门经理详情视图测试（AGENT-TYPES-OPTIMIZE W3）
 *
 * 锁定契约：
 *  - 部门经理详情渲染「代表部门」面板：部门名 + 成员名单（含 AI 成员/经理自身）
 *  - 模型可编辑保存（创建时可配——详情保存生效——消灭假配置）：改模型 →
 *    GET /api/agents/:id 断言 model 持久化
 *  - 页面零 console 错误红线
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import {
  startAgentServer, openAgentPage, registerTenant, injectAuth, apiAs, fatalErrors,
  waitForText,
  type AgentServer, type TenantAuth,
} from './shared.ts'

let server: AgentServer
let browser: Browser
let BASE = ''
let owner: TenantAuth
let deptId = ''
let mgrId = ''
let aiAgentId = ''

test.before(async () => {
  server = await startAgentServer()
  BASE = server.base
  browser = await chromium.launch()
  owner = await registerTenant(BASE, 'deptmgr')
  const dept = await apiAs(BASE, owner, '/api/departments', { method: 'POST', body: JSON.stringify({ name: '研发中心' }) })
  deptId = dept.department.id
  mgrId = dept.manager.id
  const ai = await apiAs(BASE, owner, '/api/agents', {
    method: 'POST',
    body: JSON.stringify({ type: 'ai', name: '代码评审员', model: 'deepseek-chat' }),
  })
  aiAgentId = ai.agent.id
  await apiAs(BASE, owner, `/api/departments/${deptId}/members`, {
    method: 'POST',
    body: JSON.stringify({ agent_id: aiAgentId, role: 'member' }),
  })
})

test.after(async () => {
  await browser?.close()
  server?.stop()
})

test('D1：经理详情显示「代表部门」面板——部门名 + 成员名单（含 AI 成员）', async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  await injectAuth(page, owner)
  const errors = await openAgentPage(page, BASE, `/agents/${mgrId}`)
  await waitForText(page, '代表部门')
  await waitForText(page, '研发中心')
  await waitForText(page, '代码评审员')
  // 经理自身在名单（role=manager——识别组织层级）
  await waitForText(page, '研发中心经理')
  assert.deepEqual(fatalErrors(errors), [], `页面零错误——发现: ${errors.join(' | ')}`)
  await page.close()
})

test('D2：模型可保存——改模型 → GET 断言持久化', async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  await injectAuth(page, owner)
  const errors = await openAgentPage(page, BASE, `/agents/${mgrId}`)
  await waitForText(page, '代表部门')
  // 模型 Select（第 0 个——页面唯一 select）→ DeepSeek Reasoner
  await page.locator('#sec-config select').first().selectOption({ label: 'DeepSeek Reasoner' })
  await page.locator('button:has-text("保存")').first().click()
  await page.waitForFunction(() => (document.body.textContent ?? '').includes('保存成功'), undefined, { timeout: 8000 })
  const updated = await apiAs(BASE, owner, `/api/agents/${mgrId}`)
  assert.equal(updated.agent?.model ?? updated.model, 'deepseek-reasoner', '模型已持久化')
  assert.deepEqual(fatalErrors(errors), [], `页面零错误——发现: ${errors.join(' | ')}`)
  await page.close()
})
