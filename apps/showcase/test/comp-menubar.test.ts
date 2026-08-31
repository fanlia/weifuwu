/**
 * showcase 组件测试——Menubar（/components/menubar）——全功能点固化
 * 清单：design/COMPONENT-VERIFICATION-CHECKLIST.md「Menubar」组（playwright 实测后固化）
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-menubar.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/menubar'

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

test('FP1/FP2 顶栏展开下拉 + Escape 关闭', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main [class*="menubar"]')
    const bar = page.locator('main [class*="menubar"] button, main [class*="menubar"] [class*="item"], main [class*="menubar"] [role="menuitem"], main [class*="menubar"] [class*="label"]').first()
    await bar.click()
    await page.waitForFunction(() => (document.querySelector('#__wf_portal')?.textContent ?? '').length > 0, null, { timeout: 3000 })
    await page.keyboard.press('Escape')
    await page.waitForFunction(() => (document.querySelector('#__wf_portal')?.textContent ?? '').length === 0, null, { timeout: 3000 })
  } finally { await page.close() }
})
