/**
 * showcase 组件测试——Highlight（/components/highlight）——全功能点固化
 * 清单：「Highlight」组（playwright 实测后固化）
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

test('FP1/FP2 高亮标记：单词 + 多词 query', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main mark, main [class*="mark"]')
    const marks = await page.evaluate(() => [...document.querySelectorAll('main mark, main [class*="mark"]')].map((m) => m.textContent?.trim()))
    assert.ok(marks.filter((m) => m === '张三').length >= 2, `单词多次：${marks.join(',')}`)
    assert.ok(marks.includes('weifuwu') && marks.includes('components'), '多词')
  } finally { await page.close() }
})
