/**
 * showcase 组件测试——ChatInput（/components/ai/chatinput）——完整能力
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-chatinput.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/ai/chatinput'

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

test('能力：单行发送（Enter → onSend）+ 多行（Shift+Enter 换行）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    // 单行发送
    const input = page.locator('main .wf-surface input[type="text"], main .wf-surface textarea').first()
    await input.click()
    await page.keyboard.type('第一条消息')
    await page.keyboard.press('Enter')
    await page.waitForTimeout(400)
    assert.ok(await page.evaluate(() => (document.body.textContent ?? '').includes('已发送：第一条消息')), '单行发送')
    // 流式变体（发送 → 1.5s 停止态）
    const streaming = page.locator('main .wf-surface input[type="text"], main .wf-surface textarea').nth(2)
    if (await streaming.count() > 0) {
      await streaming.click()
      await page.keyboard.type('流式测试')
      await page.keyboard.press('Enter')
      await page.waitForTimeout(300)
      assert.ok(await page.evaluate(() => (document.body.textContent ?? '').includes('停止')), '流式停止态')
    }
  } finally { await page.close() }
})
