/**
 * showcase 组件测试——ProgressBar（/components/feedback/progressbar）
 *
 * 每组件一个测试文件（单独运行）：
 *   node --env-file=.env --test apps/showcase/test/comp-progressbar.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/feedback/progressbar'

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

test('渲染零错误 + 进度条渲染（百分比文字/进度）', async () => {
  const page = await browser.newPage()
  try {
    const errors = await openShowcase(page, BASE, COMP_PATH)
    assert.deepEqual(errors.filter((e) => !e.includes('Failed to load resource')), [], `零错误（实际: ${errors[0] ?? '无'}）`)
    // 进度条元素（wf-progress 类——进度值渲染）
    const bars = await page.evaluate(() => document.querySelectorAll('main .wf-progress, main [class*="progress"]').length)
    assert.ok(bars > 0, `进度条渲染（实际 ${bars}）`)
  } finally {
    await page.close()
  }
})
