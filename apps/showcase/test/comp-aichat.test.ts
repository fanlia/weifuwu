/**
 * showcase 组件测试——AiChat（/components/ai/aichat）——完整能力
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-aichat.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/ai/aichat'

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

test('能力：流式对话（发送 → /api/chat NDJSON 回复）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    const input = page.locator('main [class*="chat"] textarea, main [class*="chat"] input[type="text"]').first()
    assert.ok(await input.count() > 0, '输入框')
    await input.click()
    await page.keyboard.type('你好')
    await page.keyboard.press('Enter')
    // 流式回复（SSE token 分块——（demo 流式回复）你刚才说：你好）
    let ok = false
    for (let i = 0; i < 60; i++) {
      if (await page.evaluate(() => (document.body.textContent ?? '').includes('你刚才说：你好'))) { ok = true; break }
      await page.waitForTimeout(100)
    }
    assert.ok(ok, '流式回复（你刚才说：你好）')
  } finally { await page.close() }
})
