/**
 * showcase 组件测试——InfiniteScroll（/components/virtual/infinitescroll）——完整能力
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-infinitescroll.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/virtual/infinitescroll'

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

test('渲染零错误 + 初始条目（加载交互场景层 deep-infinitescroll 已有）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForFunction(() => (document.body.textContent ?? '').includes('条目 1'), '初始条目', { timeout: 4000 })
    const count = await page.evaluate(() => (document.body.textContent?.match(/条目 \d+/g) ?? []).length)
    assert.ok(count >= 8, `初始条目（实际 ${count}）`)
  } finally { await page.close() }
})
