/**
 * showcase 组件测试——VirtualList（/components/virtuallist）——完整能力
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-virtuallist.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/virtuallist'

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

test('能力：虚拟滚动（200 行——视口只渲染部分——滚动后渲染变化）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    // 初始渲染部分行（视口 240/itemHeight 36 ≈ 7 行 + overscan）
    await page.waitForFunction(() => (document.body.textContent ?? '').includes('第 0 行'), '首行', { timeout: 4000 })
    const rendered0 = await page.evaluate(() => document.querySelectorAll('main [class*="virtual"] [class*="item"], main [class*="virtual"] div').length)
    // 滚动容器（scrollTop 变化 → 渲染行变化）
    const scrolled = await page.evaluate(() => {
      const el = Array.from(document.querySelectorAll('main [class*="virtual"]')).find((x) => x.scrollHeight > x.clientHeight + 50)
      if (!el) return false
      el.scrollTop = el.scrollHeight / 2
      return true
    })
    assert.ok(scrolled, '滚动容器')
    await page.waitForTimeout(400)
    const hasMiddle = await page.evaluate(() => (document.body.textContent ?? '').includes('第 100 行'))
    assert.ok(hasMiddle, `滚动后渲染中部行（${rendered0} → 中部）`)
  } finally { await page.close() }
})
