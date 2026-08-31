/**
 * showcase 组件测试——PinInput（/components/pininput）
 *
 * 每组件一个测试文件（单独运行）：
 *   node --env-file=.env --test apps/showcase/test/comp-pininput.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/pininput'

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

test('渲染零错误 + 6 位验证码输入', async () => {
  const page = await browser.newPage()
  try {
    const errors = await openShowcase(page, BASE, COMP_PATH)
    assert.deepEqual(errors.filter((e) => !e.includes('Failed to load resource')), [], `零错误（实际: ${errors[0] ?? '无'}）`)
    await page.waitForFunction(() => (document.body.textContent ?? '').includes('等待输入'), '初始等待输入', { timeout: 3000 })
    // 输入 6 位
    await page.locator('main .wf-surface input').first().click()
    await page.keyboard.type('123456')
    await page.waitForFunction(() => (document.body.textContent ?? '').includes('验证码：123456'), '验证码输入', { timeout: 3000 })
  } finally {
    await page.close()
  }
})
