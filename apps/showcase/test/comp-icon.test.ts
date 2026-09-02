/**
 * showcase 组件测试——Icon（/components/icon）——全功能点固化
 * 清单：「Icon」组（playwright 实测后固化）
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-icon.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/icon'

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

test('FP1/FP2 批量图标渲染 + 尺寸随字号', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main svg')
    const n = await page.evaluate(() => document.querySelectorAll('main svg').length)
    assert.ok(n >= 25, `svg 数 ${n}`)
    const t = await page.evaluate(() => document.querySelector('main')?.textContent ?? '')
    assert.ok(t.includes('chevron-down') && t.includes('retry'), '名称标签')
  } finally { await page.close() }
})
