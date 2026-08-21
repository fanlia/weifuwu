/**
 * showcase 组件测试——PasswordInput（/components/input/passwordinput）
 *
 * 每组件一个测试文件（单独运行）：
 *   node --env-file=.env --test apps/showcase/test/comp-passwordinput.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/input/passwordinput'

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

test('渲染零错误 + 密码框（眼睛切换可见性）', async () => {
  const page = await browser.newPage()
  try {
    const errors = await openShowcase(page, BASE, COMP_PATH)
    assert.deepEqual(errors.filter((e) => !e.includes('Failed to load resource')), [], `零错误（实际: ${errors[0] ?? '无'}）`)
    const t0 = await page.evaluate(() => document.querySelector('main .wf-surface input')?.getAttribute('type'))
    assert.equal(t0, 'password', '初始 password 类型')
    // 点击眼睛 → text 类型
    await page.locator('main .wf-surface button, main .wf-surface [class*="eye"]').first().click()
    await page.waitForFunction(() => document.querySelector('main .wf-surface input')?.getAttribute('type') === 'text', '切换可见', { timeout: 3000 })
  } finally {
    await page.close()
  }
})
