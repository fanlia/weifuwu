/**
 * showcase 组件测试——Checkbox（/components/checkbox）——全功能点固化
 * 清单：「Checkbox」组（playwright 实测后固化）
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-checkbox.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/checkbox'

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

test('FP1 初始态：checked property（agree=false / remember=true）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main .wf-checkbox')
    const st = await page.evaluate(() => [...document.querySelectorAll('main .wf-checkbox input')].map((c) => c.checked))
    assert.deepEqual(st, [false, true, false], `三实例初态 ${st}`)
  } finally { await page.close() }
})

test('FP2/FP3 点击切换 → onChange 回流 → 再点取消', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main .wf-checkbox')
    const box = page.locator('main .wf-checkbox', { hasText: '已阅读并同意协议' }).first()
    await box.click()
    await page.waitForFunction(() => (document.querySelector('main')?.textContent ?? '').includes('同意: true'), null, { timeout: 3000 })
    await box.click()
    await page.waitForFunction(() => (document.querySelector('main')?.textContent ?? '').includes('同意: false'), null, { timeout: 3000 })
  } finally { await page.close() }
})

test('FP4 disabled：点击无变化', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main .wf-checkbox')
    const before = await page.evaluate(() => document.querySelector('main')?.textContent ?? '')
    await page.locator('main .wf-checkbox', { hasText: '不可选' }).first().click({ force: true })
    await page.waitForTimeout(200)
    const after = await page.evaluate(() => document.querySelector('main')?.textContent ?? '')
    assert.equal(before, after, 'disabled 不变')
  } finally { await page.close() }
})
