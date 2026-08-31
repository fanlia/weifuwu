/**
 * showcase 组件测试——MarkdownEditor（/components/markdowneditor）——完整能力
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-markdowneditor.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/markdowneditor'

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

test('能力：分屏编辑 + 实时预览（输入 → 预览更新）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    // 分屏（编辑区 + 预览区）
    const preview = await page.evaluate(() => !!document.querySelector('main [class*="markdown-editor"] [class*="preview"], main [class*="editor"] [class*="preview"], main [class*="preview"]'))
    assert.ok(preview, '预览区')
    // 初始预览（标题/加粗渲染）
    const text = await page.evaluate(() => document.body.textContent ?? '')
    assert.ok(text.includes('实时预览') && text.includes('加粗'), '初始内容')
    // 输入（textarea——编辑区）→ 预览更新
    const ta = page.locator('main [class*="editor"] textarea, main [class*="markdown"] textarea').first()
    if (await ta.count() > 0) {
      await ta.click()
      await page.keyboard.press('End')
      await page.keyboard.type('\n新增段落')
      await page.waitForTimeout(400)
      assert.ok(await page.evaluate(() => (document.body.textContent ?? '').includes('新增段落')), '预览更新')
    }
  } finally { await page.close() }
})
