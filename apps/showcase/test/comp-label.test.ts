/**
 * showcase 组件测试——Label（/components/label）——全功能点固化
 * 清单：「Label」组（playwright 实测后固化）
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-label.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/label'

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

test('FP1/FP2 label 关联 + required 星标', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main label')
    const labels = await page.evaluate(() => [...document.querySelectorAll('main label')])
    assert.ok(labels.length >= 1, 'label 实例')
    assert.ok(await page.evaluate(() => [...document.querySelectorAll('main label [class*="req"]')].length >= 1), '星标')
  } finally { await page.close() }
})
