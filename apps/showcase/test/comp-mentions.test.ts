/**
 * showcase 组件测试——Mentions（/components/mentions）——@提及
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-mentions.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, assertPopupGeometry, type ScenarioServer } from './showcase-shared.ts'

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

test('能力：@ 提及（值 + 候选）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    const text = await page.evaluate(() => document.body.textContent ?? '')
    assert.ok(text.includes('文本：输入 @ 提及成员：@ali'), '受控值回显')
  } finally { await page.close() }
})
test('位置：portal 归属 + fixed + 视口内 + 提及面板 bottom', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    
    const input = page.locator('main [class*="mention"] input, main textarea').first()
    await input.click()
    await page.keyboard.type('@')
    await assertPopupGeometry(page, { panelText: 'Alice', anchorSel: 'main [class*="mention"] input, main textarea', dir: 'bottom', transformNone: true })
  } finally { await page.close() }
})
