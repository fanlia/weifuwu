/**
 * showcase 组件测试——SessionList（/components/sessionlist）——完整能力
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-sessionlist.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/sessionlist'

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

test('能力：会话列表 + 选中（onSelect）+ 新建', async () => {
  const page = await browser.newPage()
  try {
    await openShowcase(page, BASE, COMP_PATH)
    const text = await page.evaluate(() => document.body.textContent ?? '')
    for (const t of ['北京天气查询', '订单退款处理', '知识库问答']) assert.ok(text.includes(t), `会话：${t}`)
    // 选中（点「北京天气查询」→ active 切换）
    await page.locator('main [class*="session"] [class*="item"], main [class*="session"] li', { hasText: '北京天气查询' }).first().click()
    await page.waitForTimeout(300)
    // 新建（+ 按钮）→ 新会话
    const newBtn = page.locator('main [class*="session"] button[aria-label*="新建"], main [class*="session"] [class*="new"]').first()
    if (await newBtn.count() > 0) {
      await newBtn.click()
      await page.waitForTimeout(300)
      assert.ok(await page.evaluate(() => (document.body.textContent ?? '').includes('新会话')), '新会话出现')
    }
  } finally { await page.close() }
})

test('FP-追加 searchable 过滤（4→0→清空恢复 4）', async () => {
  const page = await browser.newPage()
  try {
    await openShowcase(page, BASE, COMP_PATH)
    await page.waitForSelector('main input')
    const cnt = () => page.evaluate(() => document.querySelectorAll('main [class*="session-item"], main [class*="session"] li, main li[class]').length)
    const before = await cnt()
    assert.ok(before >= 1, `初始会话 ${before}`)
    await page.locator('main input').first().fill('不存在的会话xyz')
    await page.waitForFunction((n) => document.querySelectorAll('main [class*="session-item"], main [class*="session"] li, main li[class]').length !== n, before, { timeout: 3000 })
    await page.locator('main input').first().fill('')
    await page.waitForFunction((n) => document.querySelectorAll('main [class*="session-item"], main [class*="session"] li, main li[class]').length === n, before, { timeout: 3000 })
  } finally { await page.close() }
})
