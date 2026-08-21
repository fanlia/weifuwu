/**
 * showcase 组件测试——List（/components/display/list）——完整能力
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-list.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/display/list'

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

test('渲染零错误 + 列表（divided + header + renderItem 文件名/时间）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    const text = await page.evaluate(() => document.body.textContent ?? '')
    for (const t of ['最近文件', '需求文档.md', '架构设计.pdf', '接口说明.docx', '2 分钟前', '昨天']) assert.ok(text.includes(t), `列表：${t}`)
    const items = await page.evaluate(() => document.querySelectorAll('main [class*="list"] [class*="item"], main [class*="list"] li').length)
    assert.ok(items >= 3, `列表项（实际 ${items}）`)
  } finally { await page.close() }
})
