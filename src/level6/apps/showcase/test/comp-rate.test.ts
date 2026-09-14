/**
 * showcase 组件测试——Rate（/components/rate）
 *
 * 每组件一个测试文件（单独运行）：
 *   node --env-file=.env --test apps/showcase/test/comp-rate.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/rate'

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

test('渲染零错误 + 变体（默认/readOnly/半星/大尺寸）', async () => {
  const page = await browser.newPage()
  try {
    const errors = await openShowcase(page, BASE, COMP_PATH)
    assert.deepEqual(errors.filter((e) => !e.includes('Failed to load resource')), [], `零错误（实际: ${errors[0] ?? '无'}）`)
  } finally {
    await page.close()
  }
})

test('demo 交互：点击第 5 星 → 当前 5 星', async () => {
  const page = await browser.newPage()
  try {
    await openShowcase(page, BASE, COMP_PATH)
    await page.waitForFunction(() => (document.body.textContent ?? '').includes('当前：3 星'), '初始 3 星', { timeout: 3000 })
    // 第一行 Rate 的第 5 个星（aria-label）
    const star = page.locator('main .wf-surface [aria-label*="5"]').first()
    await star.click()
    await page.waitForFunction(() => (document.body.textContent ?? '').includes('当前：5 星'), '5 星', { timeout: 3000 })
  } finally {
    await page.close()
  }
})

test('FP-追加 allowClear：再点同星 5→0 + 半星实例同步', async () => {
  const page = await browser.newPage()
  try {
    await openShowcase(page, BASE, COMP_PATH)
    await page.waitForSelector('main .wf-rate')
    const star5 = page.locator('main .wf-rate--lg .wf-rate-star').nth(4)
    await star5.click()
    await page.waitForFunction(() => (document.querySelector('main')?.textContent.match(/当前：(\d) 星/) ?? [])[1] === '5', null, { timeout: 3000 })
    await star5.click()
    await page.waitForFunction(() => (document.querySelector('main')?.textContent.match(/当前：(\d) 星/) ?? [])[1] === '0', null, { timeout: 3000 })
    // 半星实例与第一实例共享 v——同步 0
    const on = await page.locator('main .wf-rate').nth(2).locator('.wf-rate-star--on').count()
    assert.equal(on, 0, '半星实例同步清零')
  } finally { await page.close() }
})
