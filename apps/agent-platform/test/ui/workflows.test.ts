/**
 * /workflows 列表页 UI 测试（2027-09——用户故事全流程）
 *
 * 用户路径：空态 → 模板创建（compileGate 门）→ 列表行信息（cron 徽章/
 * 最近运行）→ 行内执行 → 点击行导航详情 → 删除。
 * 红线：页面零错误（console.error/pageerror——fatalErrors 口径同场景层）。
 * 数据种子走真实 API（GET/POST /api/workflows——不直插 SQL）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import {
  startAgentServer, openAgentPage, registerTenant, injectAuth, apiAs,
  fatalErrors, waitForText, type AgentServer, type TenantAuth,
} from './shared.ts'

let server: AgentServer
let browser: Browser
let BASE = ''
let auth: TenantAuth

test.before(async () => {
  server = await startAgentServer()
  BASE = server.base
  browser = await chromium.launch()
  auth = await registerTenant(BASE, 'workflows')
})

test.after(async () => {
  await browser?.close()
  server?.stop()
})

/** 打开列表页（已注入认证） */
async function openList(page: import('playwright').Page): Promise<string[]> {
  const errors = await openAgentPage(page, BASE, '/workflows')
  await waitForText(page, '工作流列表')
  return errors
}

test('空态：新租户显示「暂无工作流」+ 创建表单可用', async () => {
  const page = await browser.newPage()
  try {
    await injectAuth(page, auth)
    const errors = await openList(page)
    assert.ok((await page.textContent('body'))?.includes('暂无工作流'), '空态提示出现')
    assert.ok((await page.textContent('body'))?.includes('创建工作流'), '创建按钮存在')
    assert.deepEqual(fatalErrors(errors), [], '页面零错误')
  } finally { await page.close() }
})

test('模板创建：选模板 → 源码填入 → 创建成功 → 列表出现（compileGate 门）', async () => {
  const page = await browser.newPage()
  try {
    await injectAuth(page, auth)
    await openList(page)
    // 填名称 + 选「定时巡检」模板 + 填入
    await page.fill('input[placeholder="库存告警"]', '巡检-模板测试')
    await page.selectOption('select', 'daily-hook')
    await page.click('button:has-text("填入")')
    await page.waitForTimeout(300)
    // 源码已填入（模板内容出现）
    assert.ok((await page.textContent('body'))?.includes('定时巡检范例'), '模板 wfjs 已填入')
    await page.click('button:has-text("创建工作流")')
    await waitForText(page, '巡检-模板测试')
    const t = await page.textContent('body')
    assert.ok(t?.includes('未运行'), '新工作流显示未运行占位')
    assert.ok(t?.includes('active'), '状态徽章 active')
  } finally { await page.close() }
})

test('创建编译门：非法 wfjs 拒绝（Alert 错误——不落库）', async () => {
  const page = await browser.newPage()
  try {
    await injectAuth(page, auth)
    await openList(page)
    // 直接改源码为非法（textarea 清空重输）
    // 填名称（编译门需要名称非空——编译错路径）
    await page.fill('input[placeholder="库存告警"]', '编译门坏')
    const ta = page.locator('.wf-codeeditor-area').first()
    await ta.click()
    await ta.press('Control+A')
    await ta.type('const = 1', { delay: 10 })
    await page.waitForTimeout(300)
    await page.click('button:has-text("创建工作流")')
    await page.waitForTimeout(1200)
    const t = await page.textContent('body')
    // 编译错提示出现（Alert 错误——body 含错误消息）
    assert.ok(t?.includes('创建失败') || t?.includes('校验失败') || t?.includes('wfjs'), `编译错提示出现：${t?.slice(0, 200)}`)
    // 列表未新增（API 核对——编辑器草稿文本在 body 属正常，不能当断言依据）
    const list = await apiAs(BASE, auth, '/api/workflows')
    assert.ok(!(JSON.stringify(list.workflows ?? [])).includes('编译门坏'), '坏 wfjs 未落库')
  } finally { await page.close() }
})

test('行内执行：demo 模板 → toast 成功 + 最近运行刷新（manual/success）', async () => {
  const page = await browser.newPage()
  try {
    await injectAuth(page, auth)
    await openList(page)
    // 建一个 demo 工作流（API 种子——走真实创建路径）
    const wf = await apiAs(BASE, auth, '/api/workflows', {
      method: 'POST',
      body: JSON.stringify({
        name: `行内执行-${Date.now()}`, wfjs: `await log({ message: 'hi' })`,
      }),
    })
    assert.ok(wf.workflow?.id, '种子创建成功')
    await page.reload()
    await waitForText(page, '行内执行')
    // 点该行「执行」按钮（最近的按钮——按行定位：名称后面的执行）
    const rows = page.locator('.wf-row:has-text("行内执行")')
    await rows.locator('button:has-text("执行")').click()
    await waitForText(page, '执行成功')
    // 最近运行刷新（Badge success + manual）
    await page.waitForTimeout(800)
    const rowText = (await page.textContent('body')) ?? ''
    assert.ok(rowText.includes('success'), '最近运行徽章 success')
    assert.ok(rowText.includes('manual'), '触发方式 manual')
  } finally { await page.close() }
})

test('cron 徽章：API 设 cron → 列表显示 ⏱', async () => {
  const page = await browser.newPage()
  try {
    await injectAuth(page, auth)
    await openList(page)
    const wf = await apiAs(BASE, auth, '/api/workflows', {
      method: 'POST',
      body: JSON.stringify({
        name: `定时行-${Date.now()}`, wfjs: `await log({ message: 'cron' })`,
      }),
    })
    // 设 cron（更新接口——真实路径）
    await apiAs(BASE, auth, `/api/workflows/${wf.workflow.id}`, {
      method: 'PUT', body: JSON.stringify({ cron: '*/5 * * * *' }),
    })
    await page.reload()
    await waitForText(page, '定时行')
    assert.ok((await page.textContent('body'))?.includes('*/5 * * * *'), 'cron 表达式徽章显示')
  } finally { await page.close() }
})

test('行点击导航：列表行 → 详情页（URL 变化 + 内容渲染）', async () => {
  const page = await browser.newPage()
  try {
    await injectAuth(page, auth)
    await openList(page)
    const wf = await apiAs(BASE, auth, '/api/workflows', {
      method: 'POST',
      body: JSON.stringify({
        name: `导航行-${Date.now()}`, wfjs: `await log({ message: 'nav' })`,
      }),
    })
    await page.reload()
    await waitForText(page, '导航行')
    await page.click('a:has-text("导航行")')
    await page.waitForURL(/\/workflows\/[\w-]+/, { timeout: 10_000 })
    await waitForText(page, '流程')
    assert.ok(page.url().includes(wf.workflow.id), '详情 URL 含 id')
  } finally { await page.close() }
})

test('删除：行内删除 → 行消失（confirm 确认）', async () => {
  const page = await browser.newPage()
  try {
    await injectAuth(page, auth)
    await openList(page)
    const name = `待删除-${Date.now()}`
    await apiAs(BASE, auth, '/api/workflows', {
      method: 'POST', body: JSON.stringify({ name, wfjs: `await log({ message: 'x' })` }),
    })
    await page.reload()
    await waitForText(page, name)
    const rows = page.locator(`.wf-row:has-text("${name}")`)
    await rows.locator('button:has-text("删除")').click()
    await page.waitForFunction((n) => !(document.body.textContent ?? '').includes(n), name, { timeout: 10_000 })
    assert.ok(true, '行已删除')
  } finally { await page.close() }
})
