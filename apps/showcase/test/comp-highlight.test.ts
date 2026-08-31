/**
 * showcase 组件测试——Highlight（/components/highlight）——完整能力
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-highlight.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/highlight'

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

test('能力：多词高亮（query 数组——mark 元素）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    const text = await page.evaluate(() => document.body.textContent ?? '')
    assert.ok(text.includes('搜索 张三 的订单记录'), '文本渲染')
    assert.ok(text.includes('支持多词'), '多词示例')
    // mark 元素（高亮词）
    const marks = await page.evaluate(() => document.querySelectorAll('main mark, main [class*="highlight"] [class*="mark"], main [class*="hl"]').length)
    assert.ok(marks >= 2, `高亮标记（实际 ${marks}）`)
  } finally { await page.close() }
})
