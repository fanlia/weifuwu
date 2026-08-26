/**
 * e2e——R3 渲染队列 FIFO（渲染中多次触发——串行全执行——无丢失无合并歧义）
 *
 * 断言链：
 * 1. 首帧渲染（log = [1]）
 * 2. 点击「触发 5 次」→ 同步 5× ctx.render()（第 1 次 rendering——其余入队）
 * 3. FIFO 串行执行：log 依次 = [1..6]（每次渲染调用记录一次——顺序 + 全部执行）
 * 4. 再点一次（单触发）：log = [1..7]（队列空后新渲染仍正常）
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startScenarioServer, openScenario, type ScenarioServer } from './e2e-shared.ts'

let server: ScenarioServer
let BASE = ''
let browser: Browser

test.before(async () => {
  server = await startScenarioServer()
  BASE = server.base
  browser = await chromium.launch()
})

test.after(async () => {
  await browser?.close()
  server?.stop()
})

test('R3 FIFO：渲染中 5 次触发 → 串行全执行（顺序 + 无丢失）', async () => {
  const page = await browser.newPage()
  const errors: string[] = []
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 120)) })
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 120)))
  try {
    await openScenario(page, BASE, 'fifo-render')

    // 首帧 log = [1]
    const log0 = await page.locator('#fifo-log').textContent()
    assert.equal(log0, '1', '首帧渲染 1 次')

    // 触发 5 次（同步——渲染中入队）——等待全部执行（log = 1..6）
    await page.locator('#fifo-fire').click()
    await page.waitForFunction(() =>
      (document.querySelector('#fifo-log')?.textContent ?? '').split(',').length >= 6,
      'FIFO 全部执行', { timeout: 5000 })

    const log = await page.locator('#fifo-log').textContent()
    assert.equal(log, '1,2,3,4,5,6', `FIFO 串行全执行（实际: ${log}）`)

    // 队列空后新渲染正常（单触发 5 次 → 11——每次点击都是 5 次触发）
    await page.locator('#fifo-fire').click()
    await page.waitForFunction(() =>
      (document.querySelector('#fifo-log')?.textContent ?? '').split(',').length >= 11,
      '队列空后新渲染', { timeout: 5000 })

    assert.deepEqual(errors, [], `渲染期无错误（实际: ${errors.slice(0, 2).join(' | ') || '(零)'}）`)
  } finally {
    await page.close()
  }
})
