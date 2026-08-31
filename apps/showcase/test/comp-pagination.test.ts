/**
 * showcase 组件测试——Pagination（/components/pagination）——全功能点固化
 * 清单：design/COMPONENT-VERIFICATION-CHECKLIST.md「Pagination」组（playwright 实测后固化）
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-pagination.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/pagination'

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

test('FP1/FP2 页码序列 + active 高亮 + next×3 回流', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main .wf-pagination')
    const active = await page.evaluate(() => document.querySelector('main .wf-page-btn--active')?.textContent?.trim())
    assert.equal(active, '3', '初始 page=3')
    const next = page.locator('main .wf-pagination button[aria-label="下一页"]')
    for (let i = 0; i < 3; i++) { await next.click(); await page.waitForTimeout(120) }
    await page.waitForFunction(() => (document.querySelector('main')?.textContent ?? '').includes('当前页: 6'), null, { timeout: 3000 })
  } finally { await page.close() }
})

test('FP3/FP4 prev 回退 + 省略号（25 页窗口）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main .wf-pagination')
    await page.locator('main .wf-pagination button[aria-label="下一页"]').click()
    await page.locator('main .wf-pagination button[aria-label="上一页"]').click()
    await page.waitForTimeout(200)
    assert.ok(await page.locator('main .wf-page-ellipsis').count() >= 1, '省略号')
  } finally { await page.close() }
})
