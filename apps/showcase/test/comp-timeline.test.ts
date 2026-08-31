/**
 * showcase 组件测试——Timeline（/components/timeline）——完整能力
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-timeline.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/timeline'

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

test('渲染零错误 + 3 项（时间线——标题/时间/内容/状态变体）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    const text = await page.evaluate(() => document.body.textContent ?? '')
    for (const t of ['AI 回复', '工具调用 query_weather', '用户消息', '10:00:12', '生成了 256 tokens']) assert.ok(text.includes(t), `渲染：${t}`)
    // 状态变体（success/info/default——节点颜色类）
    const items = await page.evaluate(() => document.querySelectorAll('main [class*="timeline"] [class*="item"], main [class*="timeline"] li').length)
    assert.ok(items >= 3, `时间线项（实际 ${items}）`)
  } finally { await page.close() }
})

test('交互：条目点击 + Enter 触发 item onClick（demo 回流 __tlClick）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main .wf-timeline-item--clickable')
    const item = page.locator('main .wf-timeline-item--clickable').first()
    await item.click()
    await page.waitForFunction(() => (window as any).__tlClick, null, { timeout: 3000 })
    await item.focus()
    await page.keyboard.press('Enter')
    await page.waitForFunction(() => (window as any).__tlClick, null, { timeout: 3000 })
  } finally { await page.close() }
})
