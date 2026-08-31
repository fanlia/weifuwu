/**
 * showcase 组件测试——Divider（/components/divider）——完整功能
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-divider.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/divider'

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
}

test('渲染零错误 + 3 形态（水平/带文字/垂直）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    const text = await page.evaluate(() => document.body.textContent ?? '')
    for (const t of ['上方分割线', '下方分割线', '或', '左', '中', '右']) {
      assert.ok(text.includes(t), `形态渲染：${t}`)
    }
    const v = await page.evaluate(() => document.querySelectorAll('main [class*="divider"][class*="vertical"], main [class*="divider"][class*="ver"]').length)
    assert.ok(v >= 2, `垂直分割线（实际 ${v}）`)
  } finally {
    await page.close()
  }
})
