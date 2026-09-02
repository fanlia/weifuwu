/**
 * showcase 组件测试——Alert（/components/Alert）——全功能点固化
 * 清单：「Alert」组（playwright 实测后固化）
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-alert.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/alert'

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
  await page.waitForSelector('main .wf-alert')
}

test('FP1 variant 四态渲染：info/success/warning/error 语义类', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    const variants = await page.evaluate(() => ({
      info: !!document.querySelector('.wf-alert--info'),
      success: !!document.querySelector('.wf-alert--success'),
      warning: !!document.querySelector('.wf-alert--warning'),
      error: !!document.querySelector('.wf-alert--error'),
    }))
    for (const [v, ok] of Object.entries(variants)) assert.ok(ok, `variant ${v} 渲染`)
  } finally { await page.close() }
})

test('FP2 closable + onClose 回流：aria-label + 点击后消息移除', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    const alerts = page.locator('main .wf-alert')
    const n0 = await alerts.count()
    const closeBtn = page.locator('main .wf-alert', { hasText: '可关闭' }).first().locator('.wf-alert-close')
    assert.equal(await closeBtn.getAttribute('aria-label'), '关闭', 'aria-label')
    await closeBtn.click()
    await page.waitForFunction((n) => document.querySelectorAll('main .wf-alert').length === (n as number) - 1, n0, { timeout: 3000 })
  } finally { await page.close() }
})

