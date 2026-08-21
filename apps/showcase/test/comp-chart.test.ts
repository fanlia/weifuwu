/**
 * showcase 组件测试——Chart（/components/viz/chart）——柱状/饼图
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-chart.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/viz/chart'

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

test('能力：图表渲染（柱状 + 饼图）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    const text = await page.evaluate(() => document.body.textContent ?? '')
    for (const t of ['1月', '2月', '直接', '6月']) assert.ok(text.includes(t), `图表：${t}`)
    // canvas/svg 渲染
    const cv = await page.evaluate(() => document.querySelectorAll('main canvas, main svg').length)
    assert.ok(cv > 0, `canvas/svg（实际 ${cv}）`)
  } finally { await page.close() }
})
