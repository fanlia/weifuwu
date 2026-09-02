/**
 * showcase 组件测试——ColorPicker（/components/colorpicker）——全功能点固化
 * 清单：「ColorPicker」组（playwright 实测后固化）
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-colorpicker.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/colorpicker'

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

test('FP1/FP2 受控回显 + 面板展开 10 色板（portal）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main .wf-color-picker-trigger')
    const v0 = await page.evaluate(() => document.querySelector('main .wf-color-picker-value')?.textContent)
    assert.equal(v0, '#4f6ef7', '受控回显')
    await page.locator('main .wf-color-picker-trigger').first().click()
    await page.waitForSelector('#__wf_portal .wf-color-picker-grid', { timeout: 3000 })
    assert.ok(await page.locator('#__wf_portal .wf-color-picker-swatch').count() >= 10, '预设色板')
  } finally { await page.close() }
})

test('FP4 showInput：hex 输入 → onChange 回流', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main .wf-color-picker-trigger')
    await page.locator('main .wf-color-picker-trigger').first().click()
    await page.waitForSelector('#__wf_portal .wf-color-picker-input', { timeout: 3000 })
    await page.locator('#__wf_portal .wf-color-picker-input').fill('#ff0000')
    await page.locator('#__wf_portal .wf-color-picker-input').press('Enter')
    await page.waitForFunction(() => (document.querySelector('main')?.textContent ?? '').includes('当前：#ff0000'), null, { timeout: 3000 })
  } finally { await page.close() }
})

test('FP3 色板点选回流（同面板内）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main .wf-color-picker-trigger')
    await page.locator('main .wf-color-picker-trigger').first().click()
    await page.waitForSelector('#__wf_portal .wf-color-picker-swatch', { timeout: 3000 })
    await page.locator('#__wf_portal .wf-color-picker-swatch').nth(2).click()
    await page.waitForFunction(() => (document.querySelector('main')?.textContent ?? '').includes('当前：#ec4899'), null, { timeout: 3000 })
  } finally { await page.close() }
})

test('FP5 size 三档 + disabled', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main .wf-color-picker-trigger')
    const sizes = await page.evaluate(() => [...new Set([...document.querySelectorAll('main .wf-color-picker-trigger')].flatMap((t) => [...t.classList]).filter((c) => c.includes('--sm') || c.includes('--lg')))])
    assert.equal(sizes.length, 2, `sm+lg 档（默认 md）：${sizes.join(',')}`)
    assert.ok(await page.evaluate(() => [...document.querySelectorAll('main .wf-color-picker-trigger')].some((t) => t.className.includes('disabled'))), 'disabled')
  } finally { await page.close() }
})
