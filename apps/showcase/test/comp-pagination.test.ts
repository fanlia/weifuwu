/**
 * showcase 组件测试——Pagination（/components/navigation/pagination）——完整能力
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-pagination.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/navigation/pagination'

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

test('渲染零错误 + 页码（total 200——初始第 3 页）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForFunction(() => (document.body.textContent ?? '').includes('当前页: 3'), '初始第 3 页', { timeout: 3000 })
    const pages = await page.evaluate(() => document.querySelectorAll('main .wf-pagination button, main [class*="pagination"] button').length)
    assert.ok(pages >= 5, `页码按钮（实际 ${pages}）`)
  } finally { await page.close() }
})

test('能力：翻页（onChange——点页号 5 → 当前页 5）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.locator('main [class*="pagination"] button', { hasText: '4' }).first().click()
    await page.waitForFunction(() => (document.body.textContent ?? '').includes('当前页: 4'), '第 4 页', { timeout: 3000 })
  } finally { await page.close() }
})

test('能力：上一页/下一页', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    // 下一页（当前 3 → 4）
    await page.locator('main [class*="pagination"] button[aria-label*="下一页"], main [class*="pagination"] [class*="next"]').first().click()
    await page.waitForFunction(() => (document.body.textContent ?? '').includes('当前页: 4'), '下一页', { timeout: 3000 })
    // 上一页（4 → 3）
    await page.locator('main [class*="pagination"] button[aria-label*="上一页"], main [class*="pagination"] [class*="prev"]').first().click()
    await page.waitForFunction(() => (document.body.textContent ?? '').includes('当前页: 3'), '上一页', { timeout: 3000 })
  } finally { await page.close() }
})
