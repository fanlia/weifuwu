/**
 * showcase 组件测试——AutoComplete（/components/autocomplete）——输入补全
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-autocomplete.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, assertPopupGeometry, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/autocomplete'

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

test('能力：输入 → 下拉补全（支付平台管理）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    const input = page.locator('main input[placeholder*="输入"], main input[placeholder*="搜索"]').first()
    await input.click()
    await input.fill('支付')
    await page.waitForTimeout(400)
    const text = await page.evaluate(() => document.body.textContent ?? '')
    assert.ok(text.includes('支付平台管理'), '下拉选项')
  } finally { await page.close() }
})
test('位置：portal 归属 + fixed + 视口内 + 补全面板 bottom', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    
    const input = page.locator('main input[placeholder*="输入"], main input[placeholder*="搜索"]').first()
    await input.click()
    await input.fill('支付')
    await assertPopupGeometry(page, { panelText: '支付平台管理', anchorSel: 'main input', dir: 'bottom', transformNone: true })
  } finally { await page.close() }
})
