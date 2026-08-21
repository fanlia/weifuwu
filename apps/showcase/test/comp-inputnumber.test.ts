/**
 * showcase 组件测试——InputNumber（/components/input/inputnumber）
 *
 * 每组件一个测试文件（单独运行）：
 *   node --env-file=.env --test apps/showcase/test/comp-inputnumber.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/input/inputnumber'

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

test('渲染零错误 + 双控件（temperature/max_tokens）', async () => {
  const page = await browser.newPage()
  try {
    const errors = await openShowcase(page, BASE, COMP_PATH)
    assert.deepEqual(errors.filter((e) => !e.includes('Failed to load resource')), [], `零错误（实际: ${errors[0] ?? '无'}）`)
    await page.waitForFunction(() => (document.body.textContent ?? '').includes('temperature: 0.7'), 'temperature 渲染', { timeout: 3000 })
  } finally {
    await page.close()
  }
})

test('demo 交互：输入 max_tokens → 状态文字更新', async () => {
  const page = await browser.newPage()
  try {
    await openShowcase(page, BASE, COMP_PATH)
    // 第二个输入（max_tokens——type=text 数字输入）
    const inputs = page.locator('main .wf-surface input').nth(1)
    await inputs.fill('3000')
    await page.waitForFunction(() => (document.body.textContent ?? '').includes('max_tokens: 3000'), 'max_tokens 更新', { timeout: 3000 })
  } finally {
    await page.close()
  }
})
