/**
 * showcase 组件测试——MessageBubble（/components/messagebubble）——完整能力
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-messagebubble.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/messagebubble'

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

test('渲染零错误 + 角色气泡（user/assistant）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    const bubbles = await page.evaluate(() => document.querySelectorAll('main [class*="message-bubble"], main [class*="bubble"]').length)
    assert.ok(bubbles >= 2, `气泡数（实际 ${bubbles}）`)
  } finally { await page.close() }
})
