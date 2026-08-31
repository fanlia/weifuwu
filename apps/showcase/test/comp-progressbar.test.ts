/**
 * showcase 组件测试——ProgressBar（/components/progressbar）——全功能点固化
 * 清单：design/COMPONENT-VERIFICATION-CHECKLIST.md「ProgressBar」组（playwright 实测后固化）
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-progressbar.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/progressbar'

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

test('FP1/FP2 填充条 + 状态色（success/warning）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main [class*="progress"]')
    const n = await page.locator('main [class*="progress"]').count()
    assert.ok(n >= 1, `进度条 ${n}`)
    assert.ok(await page.locator('main [class*="progress-fill"], main [class*="progress"] [class*="fill"]').first().isVisible(), '填充条')
    assert.ok(await page.evaluate(() => [...document.querySelectorAll('main [class*="progress"]')].some((b) => [...b.classList].some((c) => /success|warning/.test(c)))), '状态色')
  } finally { await page.close() }
})
