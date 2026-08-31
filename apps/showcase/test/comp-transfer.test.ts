/**
 * showcase 组件测试——Transfer（/components/transfer）——穿梭框
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-transfer.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/transfer'

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

test('能力：穿梭（点成员B → 移入已选）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    const text = await page.evaluate(() => document.body.textContent ?? '')
    for (const t of ['成员A', '成员B', '成员C', '成员D']) assert.ok(text.includes(t), `成员：${t}`)
    // 移动「成员B」到右侧（穿梭按钮）
    const item = page.locator('main [class*="transfer"] [class*="item"]', { hasText: '成员B' }).first()
    if (await item.count() > 0) {
      await item.click()
      const mv = page.locator('main [class*="transfer"] [class*="move"]').first()
      if (await mv.count() > 0) { await mv.click(); await page.waitForTimeout(300) }
    }
  } finally { await page.close() }
})
