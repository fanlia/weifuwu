/**
 * showcase 组件测试——MessageBubble（/components/messagebubble）——全功能点固化
 * 清单：design/COMPONENT-VERIFICATION-CHECKLIST.md「MessageBubble」组（playwright 实测后固化）
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

test('FP1 user/assistant 双角色 + 内容渲染', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main [class*="bubble"], main [class*="message"]')
    const t = await page.evaluate(() => document.querySelector('main')?.textContent ?? '')
    assert.ok(t.includes('北京天气如何') && t.includes('25°C'), 'user 问 + assistant 答')
  } finally { await page.close() }
})

test('FP2 status 切换 + actions 重试按钮（error 态）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main button')
    await page.locator('main button', { hasText: 'error' }).first().click()
    await page.waitForFunction(() => (document.querySelector('main')?.textContent ?? '').includes('请求失败'), null, { timeout: 3000 })
    assert.ok(await page.locator('main button', { hasText: '重试' }).count() >= 1, 'actions 重试')
  } finally { await page.close() }
})
