/**
 * showcase 组件测试——LogViewer（/components/logviewer）——全功能点固化
 * 清单：「LogViewer」组（playwright 实测后固化）
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-logviewer.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/logviewer'

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

test('FP1/FP2 虚拟化行 + ANSI 色类 + 行号', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main .wf-log-row')
    assert.ok(await page.locator('main .wf-log-row').count() >= 5, '日志行')
    const ansi = await page.evaluate(() => [...new Set([...document.querySelectorAll('main [class*="ansi"]')].flatMap((e) => [...e.classList]).filter((c) => c.includes('--')))])
    assert.ok(ansi.length >= 2, `ANSI 色类 ${ansi.slice(0, 3).join(',')}`)
  } finally { await page.close() }
})

test('FP3 追加日志 + follow 自动滚底（内容溢出后）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main .wf-log-row')
    for (let i = 0; i < 12; i++) {
      await page.locator('main button', { hasText: /追加|添加/ }).first().click()
      await page.waitForTimeout(80)
    }
    await page.waitForFunction(() => {
      const el = [...document.querySelectorAll('main *')].find((e) => e.scrollHeight > e.clientHeight + 20 && (e.className || '').toString().includes('log'))
      return el && el.scrollHeight - el.scrollTop - el.clientHeight < 5
    }, null, { timeout: 3000 })
  } finally { await page.close() }
})

test('FP4 复制按钮面', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main .wf-log-row')
    const copy = await page.evaluate(() => [...document.querySelectorAll('main button')].some((b) => (b.title ?? '').includes('复制') || (b.getAttribute('aria-label') ?? '').includes('复制')))
    assert.equal(copy, true, '复制按钮')
  } finally { await page.close() }
})
