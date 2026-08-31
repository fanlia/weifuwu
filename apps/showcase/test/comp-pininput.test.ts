/**
 * showcase 组件测试——PinInput（/components/pininput）——全功能点固化
 * 清单：design/COMPONENT-VERIFICATION-CHECKLIST.md「PinInput」组（playwright 实测后固化）
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-pininput.test.ts
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

async function open(page: import('playwright').Page): Promise<void> {
  const errors = await openShowcase(page, BASE, COMP_PATH)
  assert.deepEqual(errors.filter((e) => !e.includes('Failed to load resource')), [], `零错误（实际: ${errors[0] ?? '无'}）`)
  await page.waitForTimeout(300)
}

test('FP1/FP2 6 格 + 逐格填入 → onChange 完整值回流', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main input')
    assert.equal(await page.locator('main input').count(), 6, '6 格')
    const digits = ['4', '8', '3', '9', '2', '0']
    for (let i = 0; i < 6; i++) {
      await page.locator('main input').nth(i).fill(digits[i])
      await page.waitForTimeout(60)
    }
    await page.waitForFunction(() => (document.querySelector('main')?.textContent ?? '').includes('483920'), null, { timeout: 3000 })
  } finally { await page.close() }
})
