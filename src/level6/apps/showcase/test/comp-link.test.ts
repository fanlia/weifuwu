/**
 * showcase 组件测试——Link（/components/link）——全功能点固化
 * 清单：「Link」组（playwright 实测后固化）
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-link.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/link'

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

test('FP1/FP2 variant 变体 + href 链接面', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main a, main [class*="link"]')
    const variants = await page.evaluate(() => [...new Set([...document.querySelectorAll('main a, main [class*="link"]')].flatMap((l) => [...l.classList]).filter((c) => /primary|danger|muted/.test(c)))])
    assert.ok(variants.length >= 2, `变体类 ${variants.join(',')}`)
    assert.ok(await page.evaluate(() => [...document.querySelectorAll('main a[href]')].length >= 1), 'href')
  } finally { await page.close() }
})
