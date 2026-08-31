/**
 * showcase 组件测试——InputNumber（/components/inputnumber）——全功能点固化
 * 清单：design/COMPONENT-VERIFICATION-CHECKLIST.md「InputNumber」组（playwright 实测后固化）
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-inputnumber.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/inputnumber'

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

test('FP1/FP2 初值 + 步进按钮回流（step=0.1 precision=1）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main .wf-inputnumber-input')
    const first = page.locator('main .wf-inputnumber-input').first()
    assert.equal(await first.inputValue(), '0.7', '初值')
    await page.locator('main .wf-inputnumber-btn').first().click()
    await page.waitForFunction(() => (document.querySelector('main')?.textContent ?? '').includes('temperature: 0.8'), null, { timeout: 3000 })
  } finally { await page.close() }
})

test('FP3 max 钳制：连续步进封顶 max=1（不越界）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main .wf-inputnumber-btn')
    const stepUp = page.locator('main .wf-inputnumber-btn').first()
    for (let i = 0; i < 5; i++) {
      await stepUp.click()
      await page.waitForTimeout(100)
    }
    const t = await page.evaluate(() => document.querySelector('main')?.textContent ?? '')
    assert.ok(/temperature: 1($|\b)/.test(t), `钳制到 max=${t.match(/temperature: [\d.]+/)?.[0]}`)
  } finally { await page.close() }
})
