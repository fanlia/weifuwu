/**
 * showcase 组件测试——InfiniteScroll（/components/infinitescroll）——全功能点固化
 * 清单：「InfiniteScroll」组（playwright 实测后固化）
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-infinitescroll.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/infinitescroll'

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

test('FP1 连续触底 → onLoadMore 持续触发（内容增长）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    const t0 = await page.evaluate(() => (document.querySelector('main')?.textContent ?? '').length)
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
      await page.waitForTimeout(600)
    }
    const t1 = await page.evaluate(() => (document.querySelector('main')?.textContent ?? '').length)
    assert.ok(t1 > t0, `内容增长 ${t0}→${t1}`)
  } finally { await page.close() }
})
