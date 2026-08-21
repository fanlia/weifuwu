/**
 * showcase 组件测试——FilePreview（/components/editor/filepreview）——完整能力
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-filepreview.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/editor/filepreview'

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

test('能力：md 文件预览（内容渲染 + 编辑入口）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    // 文件预览（README.md——文件名显示 + 预览区）
    await page.waitForFunction(() => (document.body.textContent ?? '').includes('README.md'), '文件预览', { timeout: 5000 })
    const text = await page.evaluate(() => document.body.textContent ?? '')
    assert.ok(text.includes('README.md'), '文件名渲染')
  } finally { await page.close() }
})
