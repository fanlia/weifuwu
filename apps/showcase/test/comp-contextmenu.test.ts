/**
 * showcase 组件测试——ContextMenu（/components/contextmenu）——全功能点固化
 * 清单：「ContextMenu」组（playwright 实测后固化）
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-contextmenu.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/contextmenu'

let server: ScenarioServer
let BASE = ''
let browser: Browser

test.before(async () => {
  server = await startShowcaseServer()
  BASE = server.base
  browser = await chromium.launch()
})

test.after(async () => {
  await browser?.close()
  server?.stop()
})

async function open(page: import('playwright').Page): Promise<void> {
  const errors = await openShowcase(page, BASE, COMP_PATH)
  assert.deepEqual(errors.filter((e) => !e.includes('Failed to load resource')), [], `零错误（实际: ${errors[0] ?? '无'}）`)
  await page.waitForTimeout(300)
}

test('FP1/FP2 右键菜单：items 渲染 + danger 变体', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main .wf-context-menu-trigger')
    await page.locator('main .wf-context-menu-trigger').first().click({ button: 'right' })
    await page.waitForSelector('#__wf_portal .wf-context-menu', { timeout: 3000 })
    const t = await page.evaluate(() => document.querySelector('#__wf_portal .wf-context-menu')?.textContent ?? '')
    for (const w of ['编辑', '复制', '删除']) assert.ok(t.includes(w), w)
    assert.ok(await page.evaluate(() => [...document.querySelectorAll('#__wf_portal [class*="danger"]')].length >= 1), 'danger 类')
  } finally { await page.close() }
})

test('FP3 点菜单项：onClick 回调 + 菜单关闭 + 回显', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main .wf-context-menu-trigger')
    await page.locator('main .wf-context-menu-trigger').first().click({ button: 'right' })
    await page.waitForSelector('#__wf_portal .wf-context-menu', { timeout: 3000 })
    await page.locator('#__wf_portal .wf-context-menu *', { hasText: '编辑' }).last().click()
    await page.waitForFunction(() => (document.querySelector('main')?.textContent ?? '').includes('已选：编辑'), null, { timeout: 3000 })
    await page.waitForFunction(() => !(document.querySelector('#__wf_portal')?.textContent ?? '').includes('复制'), null, { timeout: 3000 })
  } finally { await page.close() }
})

test('FP4 Escape 关闭', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main .wf-context-menu-trigger')
    await page.locator('main .wf-context-menu-trigger').first().click({ button: 'right' })
    await page.waitForSelector('#__wf_portal .wf-context-menu', { timeout: 3000 })
    await page.keyboard.press('Escape')
    await page.waitForFunction(() => !(document.querySelector('#__wf_portal')?.textContent ?? '').includes('编辑'), null, { timeout: 3000 })
  } finally { await page.close() }
})

test('交互：右键打开自动聚焦 → ArrowDown 环形导航 + Enter 执行关闭（autoFocus 内核回归）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main [class*="context"]')
    await page.locator('main [class*="context"]').first().click({ button: 'right' })
    await page.waitForSelector('#__wf_portal .wf-context-menu', { timeout: 3000 })
    // 内核 autoFocus（popup-manager——2027-09 ContextMenu 实证修复）聚焦菜单容器；
    // 行为级断言：ArrowDown 高亮移动（聚焦成功的可观测结果）
    const hlText = () => page.evaluate(() => document.querySelector('#__wf_portal .wf-context-menu-item--hl')?.textContent?.trim())
    const first = await hlText()
    await page.keyboard.press('ArrowDown')
    await page.waitForFunction((f) => document.querySelector('#__wf_portal .wf-context-menu-item--hl')?.textContent?.trim() !== f, first, { timeout: 3000 })
    await page.keyboard.press('Enter')
    await page.waitForFunction(() => !document.querySelector('#__wf_portal .wf-context-menu'), null, { timeout: 3000 })
  } finally { await page.close() }
})
