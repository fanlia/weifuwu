/**
 * showcase 组件测试——ToolCallCard（/components/ai/toolcallcard）——完整能力
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-toolcallcard.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/ai/toolcallcard'

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

test('能力：4 状态（待执行/进度/成功/失败）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    const text = await page.evaluate(() => document.body.textContent ?? '')
    for (const t of ['query_weather', 'generate_report', 'send_email', 'place_order', '生成中…', '人工拒绝']) assert.ok(text.includes(t), `状态：${t}`)
    const cards = await page.evaluate(() => document.querySelectorAll('main [class*="tool-call"], main [class*="toolcall"]').length)
    assert.ok(cards >= 4, `卡片数（实际 ${cards}）`)
  } finally { await page.close() }
})
