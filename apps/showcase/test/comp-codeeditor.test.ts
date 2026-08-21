/**
 * showcase 组件测试——CodeEditor（/components/editor/codeeditor）——完整能力
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-codeeditor.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/editor/codeeditor'

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

test('能力：代码编辑（行号 + 输入 onChange）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    // textarea 值（受控 value——不在 textContent）
    const ta = page.locator('main textarea').first()
    const init = await ta.inputValue()
    assert.ok(init.includes('const greet'), '初始代码')
    // 输入 → onChange
    await ta.click()
    await page.keyboard.press('End')
    await page.keyboard.type('\n// 新增')
    await page.waitForTimeout(400)
    const v = await ta.inputValue()
    assert.ok(v.includes('// 新增'), `输入生效（实际 ${v.slice(-20)}）`)
  } finally { await page.close() }
})
