/**
 * showcase 组件测试——Calendar（/components/advanced/calendar）——月视图+事件
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-calendar.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/advanced/calendar'

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

test('能力：月视图 + 事件标记（产品评审）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    const text = await page.evaluate(() => document.body.textContent ?? '')
    assert.ok(text.includes('产品评审'), '事件显示')
    // 星期表头
    assert.ok(text.includes('一') && text.includes('日'), '周表头')
  } finally { await page.close() }
})
