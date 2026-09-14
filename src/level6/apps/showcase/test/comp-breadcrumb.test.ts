/**
 * showcase 组件测试——Breadcrumb（/components/breadcrumb）——全功能点固化
 * 清单：「Breadcrumb」组（playwright 实测后固化）
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-breadcrumb.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/breadcrumb'

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

test('FP1 href 链接面：前级可点链接 + 末级纯文本', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main [class*="breadcrumb"]')
    const links = await page.evaluate(() => [...document.querySelectorAll('main a')].map((a) => ({ t: a.textContent?.trim(), h: a.getAttribute('href') })))
    assert.ok(links.some((l) => l.t === '首页' && l.h === '/'), '首页 → /')
    assert.ok(links.some((l) => l.t === '用户管理' && l.h === '/users'), '用户管理 → /users')
    const tail = await page.evaluate(() => document.querySelector('main [class*="breadcrumb"]')?.textContent ?? '')
    assert.ok(tail.includes('编辑'), '末级「编辑」纯文本')
  } finally { await page.close() }
})

test('FP2 分隔符渲染：3 段结构', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main [class*="breadcrumb"]')
    const parts = await page.evaluate(() => (document.querySelector('main [class*="breadcrumb"]')?.textContent ?? '').trim())
    assert.ok(parts.includes('首页') && parts.includes('用户管理') && parts.includes('编辑'), `三段：${parts}`)
  } finally { await page.close() }
})
