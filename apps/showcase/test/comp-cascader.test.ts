/**
 * showcase 组件测试——Cascader（/components/cascader）——级联选择
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-cascader.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, assertPopupGeometry, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/cascader'

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

test('能力：级联面板（点开 → 省份/城市选项）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    const text = await page.evaluate(() => document.body.textContent ?? '')
    assert.ok(text.includes('浙江'), '已选值显示')
    // 点开 → 面板（浙江/广东 + 城市）
    await page.locator('main [class*="cascader"]').first().click()
    await page.waitForTimeout(400)
    const panel = await page.evaluate(() => document.body.textContent ?? '')
    assert.ok(panel.includes('广东'), '面板展开（广东）')
  } finally { await page.close() }
})
test('位置：portal 归属 + fixed + 视口内 + 级联面板 bottom', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    
    await page.locator('main [class*="cascader"]').first().click()
    await assertPopupGeometry(page, { panelText: '广东', anchorSel: 'main [class*="cascader"]', dir: 'bottom', transformNone: true })
  } finally { await page.close() }
})
