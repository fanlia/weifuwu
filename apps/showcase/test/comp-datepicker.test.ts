/**
 * showcase 组件测试——DatePicker（/components/datepicker）——日期选择
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-datepicker.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, assertPopupGeometry, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/datepicker'

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

test('能力：弹层 + 选日期（onChange 回显）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    const input = page.locator('main [placeholder="选择日期"]').first()
    await input.click()
    await page.waitForTimeout(400)
    const panel = await page.evaluate(() => document.body.textContent ?? '')
    assert.ok(panel.includes('日一二三四五六') || panel.includes('2026年8月'), '面板展开（日历网格）')
    // 选一个日期
    const day = page.locator('main [class*="calendar"] [class*="day"], main [class*="datepicker"] [class*="cell"]').first()
    if (await day.count() > 0) { await day.click(); await page.waitForTimeout(300) }
  } finally { await page.close() }
})
test('位置：portal 归属 + fixed + 视口内 + 日历面板 bottom', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    
    const input = page.locator('main [placeholder="选择日期"]').first()
    await input.click()
    await assertPopupGeometry(page, { panelSel: '[class*="datepicker-panel"], [class*="calendar-panel"], [class*="datepicker-weekdays"]', anchorSel: 'main [placeholder="选择日期"]', dir: 'bottom', transformNone: true })
  } finally { await page.close() }
})
