/**
 * showcase 组件测试——StatCard（/components/statcard）——完整能力
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-statcard.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/statcard'

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

test('渲染零错误 + 3 卡片（label/value/trend/icon）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    const text = await page.evaluate(() => document.body.textContent ?? '')
    for (const t of ['总用户', '1,234', '收入', '¥89,000', '退款', '12%']) assert.ok(text.includes(t), `卡片：${t}`)
    const cards = await page.evaluate(() => document.querySelectorAll('main [class*="wf-stat"]').length)
    assert.ok(cards >= 3, `卡片数（实际 ${cards}）`)
  } finally { await page.close() }
})

test('交互：可点击卡片 click + Enter（role=button——demo 回流 __statClick）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main .wf-stat--clickable')
    const card = page.locator('main .wf-stat--clickable').first()
    await card.click()
    await page.waitForFunction(() => (window as any).__statClick >= 1, null, { timeout: 3000 })
    await card.focus()
    await page.keyboard.press('Enter')
    await page.waitForFunction(() => (window as any).__statClick >= 2, null, { timeout: 3000 })
  } finally { await page.close() }
})
