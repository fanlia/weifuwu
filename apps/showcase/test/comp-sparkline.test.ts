/**
 * showcase 组件测试——Sparkline（/components/viz/sparkline）——迷你趋势
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-sparkline.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/viz/sparkline'

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

test('能力：迷你趋势图（svg polyline/path）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    const svg = await page.evaluate(() => document.querySelectorAll('main [class*="spark"] svg, main [class*="sparkline"] svg, main svg').length)
    assert.ok(svg > 0, `svg 渲染（实际 ${svg}）`)
  } finally { await page.close() }
})
