/**
 * showcase 组件测试——Dropdown（/components/dropdown）——全功能点固化
 * 清单：design/COMPONENT-VERIFICATION-CHECKLIST.md「Dropdown」组（playwright 实测后固化）
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-dropdown.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/dropdown'

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

test('FP1/FP2 点击菜单：items + danger 变体 + 选择回流关闭', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main button')
    await page.locator('main button', { hasText: '操作 ▾' }).first().click()
    await page.waitForSelector('#__wf_portal .wf-dropdown-menu', { timeout: 3000 })
    const t = await page.evaluate(() => document.querySelector('#__wf_portal .wf-dropdown-menu')?.textContent ?? '')
    for (const w of ['编辑', '复制', '删除']) assert.ok(t.includes(w), w)
    assert.ok(await page.locator('#__wf_portal .wf-dropdown-item--danger').count() === 1, 'danger 项')
    await page.locator('#__wf_portal .wf-dropdown-item', { hasText: '编辑' }).first().click()
    await page.waitForFunction(() => (document.querySelector('main')?.textContent ?? '').includes('上次: 编辑'), null, { timeout: 3000 })
    await page.waitForFunction(() => !(document.querySelector('#__wf_portal')?.textContent ?? '').includes('复制'), null, { timeout: 3000 })
  } finally { await page.close() }
})

test('FP3 Escape 关闭', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main button')
    await page.locator('main button', { hasText: '操作 ▾' }).first().click()
    await page.waitForSelector('#__wf_portal .wf-dropdown-menu', { timeout: 3000 })
    await page.keyboard.press('Escape')
    await page.waitForFunction(() => !(document.querySelector('#__wf_portal')?.textContent ?? '').includes('编辑'), null, { timeout: 3000 })
  } finally { await page.close() }
})
