/**
 * showcase 组件测试——Checkbox（/components/input/checkbox）
 *
 * 每组件一个测试文件（单独运行）：
 *   node --env-file=.env --test apps/showcase/test/comp-checkbox.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/input/checkbox'

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

test('渲染零错误 + 3 变体（协议/记住/disabled）', async () => {
  const page = await browser.newPage()
  try {
    const errors = await openShowcase(page, BASE, COMP_PATH)
    assert.deepEqual(errors.filter((e) => !e.includes('Failed to load resource')), [], `零错误（实际: ${errors[0] ?? '无'}）`)
    const text = await page.evaluate(() => document.body.textContent ?? '')
    for (const t of ['已阅读并同意协议', '记住登录状态', '不可选 (disabled)']) {
      assert.ok(text.includes(t), `变体渲染：${t}`)
    }
  } finally {
    await page.close()
  }
})

test('demo 交互：同意 → true；记住 → false（状态文字）', async () => {
  const page = await browser.newPage()
  try {
    await openShowcase(page, BASE, COMP_PATH)
    // 初始：同意 false / 记住 true
    await page.waitForFunction(() => (document.body.textContent ?? '').includes('同意: false, 记住: true'), '初始状态', { timeout: 3000 })
    // 点「已阅读并同意协议」（label 点击）
    await page.locator('main .wf-surface label', { hasText: '已阅读并同意协议' }).first().click()
    await page.waitForFunction(() => (document.body.textContent ?? '').includes('同意: true'), '同意变 true', { timeout: 3000 })
    // 点「记住登录状态」→ false
    await page.locator('main .wf-surface label', { hasText: '记住登录状态' }).first().click()
    await page.waitForFunction(() => (document.body.textContent ?? '').includes('记住: false'), '记住变 false', { timeout: 3000 })
  } finally {
    await page.close()
  }
})
