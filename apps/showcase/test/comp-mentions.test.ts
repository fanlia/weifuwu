/**
 * showcase 组件测试——Mentions（/components/mentions）——全功能点固化
 * 清单：「Mentions」组（playwright 实测后固化）
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-mentions.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/mentions'

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

test('FP1/FP2 @ 触发联想下拉 + 选择补全 onChange 回流', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main textarea')
    const ta = page.locator('main textarea').first()
    await ta.fill('')
    await ta.pressSequentially('@ali')
    await page.waitForFunction(() => ((document.querySelector('#__wf_portal')?.textContent ?? '') + (document.querySelector('main')?.textContent ?? '')).includes('Alice'), null, { timeout: 3000 })
    const pick = page.locator('#__wf_portal [class*="option"], main [class*="mention"] [class*="option"]').filter({ hasText: 'Alice' }).first()
    await pick.click()
    await page.waitForFunction(() => (document.querySelector('main')?.textContent ?? '').includes('@alice'), null, { timeout: 3000 })
  } finally { await page.close() }
})
