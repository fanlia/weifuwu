/**
 * showcase 组件测试——Anchor（/components/navigation/anchor）——完整能力
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-anchor.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/navigation/anchor'

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

test('渲染零错误 + 3 锚点（第一节/第二节/第三节）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    // 滚动上下文（content/ 移除后文档页变短——滚动断言扩高页面）
    await page.evaluate(() => { document.body.style.minHeight = '2500px' })
    const text = await page.evaluate(() => document.body.textContent ?? '')
    for (const t of ['第一节', '第二节', '第三节']) assert.ok(text.includes(t), `锚点：${t}`)
  } finally { await page.close() }
})

test('能力：点击锚点 → onAnchorChange（受控 active 更新——高亮）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    // 滚动上下文（滚动跟随断言需足够页高）
    await page.evaluate(() => { document.body.style.minHeight = '2500px' })
    // 初始 active 第一节
    await page.waitForFunction(() => document.querySelector('main [class*="anchor"] [class*="active"]')?.textContent?.includes('第一节') ?? false, '初始第一节高亮', { timeout: 3000 })
    // 点「第二节」→ 高亮切换（onAnchorChange）
    await page.locator('main [class*="anchor"] [class*="item"], main [class*="anchor"] a', { hasText: '第二节' }).first().click()
    await page.waitForFunction(() => document.querySelector('main [class*="anchor"] [class*="active"]')?.textContent?.includes('第二节') ?? false, '第二节高亮', { timeout: 3000 })
    // 滚动到第三节 → 跟随高亮（onAnchorChange——滚动驱动）
    await page.evaluate(() => document.getElementById('anchor-c')?.scrollIntoView())
    await page.waitForFunction(() => document.querySelector('main [class*="anchor"] [class*="active"]')?.textContent?.includes('第三节') ?? false, '滚动跟随第三节', { timeout: 4000 })
  } finally { await page.close() }
})
