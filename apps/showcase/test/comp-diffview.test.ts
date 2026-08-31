/**
 * showcase 组件测试——DiffView（/components/diffview）——完整能力
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-diffview.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/diffview'

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

test('能力：新旧代码对比（标题 + 差异行）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    const text = await page.evaluate(() => document.body.textContent ?? '')
    assert.ok(text.includes('重构前') && text.includes('重构后'), '标题')
    // 差异行（+/−/删除行——diff 标记）
    const marks = await page.evaluate(() => {
      const els = document.querySelectorAll('main [class*="diff"] [class*="add"], main [class*="diff"] [class*="del"], main [class*="diff"] [class*="remove"], main [class*="diff"] [class*="line"]')
      return els.length
    })
    assert.ok(marks >= 3, `差异行（实际 ${marks}）`)
  } finally { await page.close() }
})
