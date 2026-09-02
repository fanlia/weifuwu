/**
 * showcase 组件测试——Loading（/components/loading）——全功能点固化
 * 清单：「Loading」组（playwright 实测后固化）
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-loading.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/loading'

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

test('FP1 加载指示器（spinner + 文本）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main [class*="spin"], main [class*="loading"]')
    const info = await page.evaluate(() => ({
      spin: document.querySelectorAll('main [class*="spin"] svg, main [class*="spin"] [class*="icon"], main [class*="spin"]').length,
      t: (document.querySelector('main')?.textContent ?? '').includes('加载'),
    }))
    assert.ok(info.spin >= 1 || info.t, JSON.stringify(info))
  } finally { await page.close() }
})
