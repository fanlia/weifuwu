/**
 * e2e——R3 redirect 消费时序（302 + Location → replaceState + 渲染目标）
 *
 * 断言链：
 * 1. 直接访问 /scenario/redirect-origin（redirect 源——302）
 * 2. serve 消费：不渲染空响应——replaceState（URL 变 target）——渲染目标页
 * 3. 目标页内容出现（#redirect-ok）+ URL = /scenario/redirect-target
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startScenarioServer, type ScenarioServer } from './e2e-shared.ts'

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

test('R3 redirect：302 → replaceState + 渲染目标（不渲染空响应）', async () => {
  const page = await browser.newPage()
  const errors: string[] = []
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 120)) })
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 120)))
  try {
    await page.goto(`${BASE}/scenario/redirect-origin`, { waitUntil: 'domcontentloaded' })
    // 目标页渲染（#redirect-ok 出现——redirect 消费链路完成）
    await page.waitForFunction(() => document.querySelector('#redirect-ok') !== null, '目标页渲染', { timeout: 6000 })
    // URL 已 replaceState 为 target
    const url = page.url()
    assert.ok(url.includes('/scenario/redirect-target'), `URL 已重定向（实际: ${url}）`)
    assert.deepEqual(errors, [], `重定向消费无错误（实际: ${errors.slice(0, 2).join(' | ') || '(零)'}）`)
  } finally {
    await page.close()
  }
})
