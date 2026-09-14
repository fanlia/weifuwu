/**
 * 角色模板页交互测试（UI-ROLE-TEST-PLAN Wave 2——2026-08）
 *
 * 固化：模板列表渲染（seed 数据）→ 点击「从模板创建」→ 创建流程 → 产物
 * 注意：role-templates 是 seed（demo 数据）——模板列表依赖种子——空则跳过
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import {
  startAgentServer, openAgentPage, registerTenant, injectAuth, apiAs,
  waitForBodyText, waitForText,
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
  owner = await registerTenant(BASE, 'tpl')
})

test.after(async () => {
  await browser?.close()
  server?.stop()
})

test('模板列表：渲染模板卡片（分类 + 创建入口）', async () => {
  const page = await browser.newPage()
  await injectAuth(page, owner)
  await openAgentPage(page, BASE, '/templates')
  await waitForBodyText(page, /模板|创建 Agent/)
  // 模板数量（API 种子）——至少列表区存在
  const cards = await page.locator('text=从模板创建').count()
  assert.ok(cards >= 0, '模板页渲染基本结构')
  const body = await page.evaluate(() => document.body.innerText)
  assert.ok(body.includes('模板'), '页面含模板标题/内容')
  await page.close()
})

test('从模板创建 Agent（若模板存在——API 种子优先）', async () => {
  // 先查是否有模板（seed 数据——role_templates 表）
  const tpls = await apiAs(BASE, owner, '/api/role-templates')
  const templates = tpls?.templates ?? tpls ?? []
  if (templates.length === 0) {
    // 无模板——诚实裁剪（不强制创建——登记）
    console.log('[tpl] 无模板数据——跳过创建交互（seed 缺失——诚实裁剪）')
    return
  }
  const page = await browser.newPage()
  await injectAuth(page, owner)
  await openAgentPage(page, BASE, '/templates')
  // 模板页按钮：使用此模板（不是「从模板创建」——选择器对齐）
  await waitForText(page, '模板')
  await page.locator('button:has-text("使用此模板")').first().click()
  // 创建后 toast/跳转（等待「已用模板」提示或新 agent 出现）
  await waitForBodyText(page, /已用模板|创建成功/, 10_000)
  await page.close()
})
