/**
 * showcase 组件测试——PasswordInput（/components/passwordinput）——全功能点固化
 * 清单：design/COMPONENT-VERIFICATION-CHECKLIST.md「PasswordInput」组（playwright 实测后固化）
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-passwordinput.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/passwordinput'

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

test('FP1 密码遮蔽 + 眼睛按钮切换明文', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main input[type="password"]')
    assert.equal(await page.evaluate(() => document.querySelector('main input[type="password"]')?.type), 'password', '遮蔽')
    await page.locator('main button[aria-label="显示密码"]').first().click()
    await page.waitForFunction(() => document.querySelector('main input')?.type === 'text', null, { timeout: 3000 })
  } finally { await page.close() }
})

test('FP2 逐键输入焦点保持（受控回流不重挂）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main input[type="password"]')
    const input = page.locator('main input[type="password"]').first()
    await input.click()
    await page.keyboard.type('ab')
    await page.waitForFunction(() => {
      const i = document.querySelector('main input[type="password"]')
      return i?.value.endsWith('ab') && document.activeElement === i
    }, null, { timeout: 3000 })
  } finally { await page.close() }
})
