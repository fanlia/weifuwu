/**
 * showcase 组件测试——FileUpload（/components/editor/fileupload）——完整能力
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-fileupload.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/editor/fileupload'

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

test('能力：文件选择（setInputFiles → onChange 文件列表）+ 上传进度', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    const input = page.locator('main [class*="file-upload"] input[type="file"], main input[type="file"]').first()
    assert.ok(await input.count() > 0, '文件 input')
    await input.setInputFiles({ name: '测试.txt', mimeType: 'text/plain', buffer: Buffer.from('内容') })
    // 文件列表出现（文件名）
    await page.waitForFunction(() => (document.body.textContent ?? '').includes('测试.txt'), '文件列表', { timeout: 4000 })
    // 模拟上传（进度按钮——上传中进度条）
    await page.locator('main .wf-surface button', { hasText: '模拟上传' }).first().click()
    await page.waitForFunction(() => {
      const t = document.body.textContent ?? ''
      return t.includes('%') || t.includes('进度') || t.includes('上传中')
    }, '上传进度', { timeout: 4000 })
  } finally { await page.close() }
})
