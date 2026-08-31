/**
 * showcase 组件测试——BackTop（/components/backtop）——完整能力
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-backtop.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/backtop'

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

test('渲染零错误 + 滚动 >400px 出现 → 点击回顶', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    // 滚动上下文（content/ 移除后文档页变短——滚动断言扩高页面）
    await page.evaluate(() => { document.body.style.minHeight = '2500px' })
    // 初始 hidden 类（无滚动）
    const hidden0 = await page.evaluate(() => document.querySelector('main .wf-backtop')?.className.includes('--hidden') ?? false)
    assert.ok(hidden0, '初始 hidden 类')
    // 滚动 600px → hidden 移除（出现）
    await page.evaluate(() => window.scrollTo(0, 600))
    await page.waitForFunction(() => !(document.querySelector('main .wf-backtop')?.className.includes('--hidden') ?? true), '滚动后出现', { timeout: 3000 })
    // 点击 → 回顶（scrollY 接近 0）
    await page.locator('main .wf-backtop').click()
    await page.waitForFunction(() => window.scrollY < 50, '回顶', { timeout: 4000 })
  } finally { await page.close() }
})
