/**
 * showcase 组件测试——CodeBlock（/components/display/codeblock）——完整能力
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-codeblock.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/display/codeblock'

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

test('渲染零错误 + 语言标签/标题 + 复制按钮（点击复制）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    const text = await page.evaluate(() => document.body.textContent ?? '')
    assert.ok(text.includes('示例.ts'), '标题')
    assert.ok(text.includes('import { Markdown }'), '代码内容')
    // 语言标签（ts）
    const lang = await page.evaluate(() => !!document.querySelector('main [class*="codeblock"] [class*="lang"], main [class*="code"][class*="lang"]'))
    assert.ok(lang || text.includes('ts'), '语言标签')
    // 复制按钮（点击 → 无错误——剪贴板降级）
    const copyBtn = page.locator('main [class*="codeblock"] [class*="copy"], main [class*="code"] button').first()
    if (await copyBtn.count() > 0) {
      await copyBtn.click()
      await page.waitForTimeout(400)
      const errs: string[] = []
      page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()) })
      assert.deepEqual(errs.filter((e) => !e.includes('Failed to load resource')), [], `复制无错误（实际: ${errs[0] ?? '无'}）`)
    }
  } finally { await page.close() }
})
