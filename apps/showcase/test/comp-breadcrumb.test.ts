/**
 * showcase 组件测试——Breadcrumb（/components/breadcrumb）——完整能力
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

test('渲染零错误 + 3 项（首页/用户管理/编辑——链接 + 末项无链接）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    const text = await page.evaluate(() => document.body.textContent ?? '')
    for (const t of ['首页', '用户管理', '编辑']) assert.ok(text.includes(t), `项：${t}`)
    const links = await page.evaluate(() => {
      const bc = document.querySelector('main [class*="breadcrumb"]')
      return Array.from(bc?.querySelectorAll('a') ?? []).map((a) => a.getAttribute('href'))
    })
    assert.deepEqual(links, ['/', '/users'], `链接 href（实际 ${JSON.stringify(links)}）`)
    // 分隔符（› 或 /）
    const sep = await page.evaluate(() => {
      const bc = document.querySelector('main [class*="breadcrumb"]')
      return bc?.textContent?.includes('›') || bc?.textContent?.includes('/') || false
    })
    assert.ok(sep, '分隔符')
  } finally { await page.close() }
})
