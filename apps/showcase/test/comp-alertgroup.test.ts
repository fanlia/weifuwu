/**
 * showcase 组件测试——AlertGroup（/components/display/alertgroup）
 *
 * 每组件一个测试文件（单独运行）：
 *   node --env-file=.env --test apps/showcase/test/comp-alertgroup.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/display/alertgroup'

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

test('渲染零错误 + 折叠态（≥3 条折叠为 +N）→ 点击展开消息', async () => {
  const page = await browser.newPage()
  try {
    const errors = await openShowcase(page, BASE, COMP_PATH)
    assert.deepEqual(errors.filter((e) => !e.includes('Failed to load resource')), [], `零错误（实际: ${errors[0] ?? '无'}）`)
    // 折叠态（4 条 ≥ 3——折叠为 +4）
    await page.waitForFunction(() => (document.body.textContent ?? '').includes('+4'), '折叠态 +4', { timeout: 3000 })
    // 点击展开 → 消息列表
    await page.locator('main .wf-surface button, main .wf-surface [class*="more"]', { hasText: '+4' }).first().click()
    await page.waitForFunction(() => (document.body.textContent ?? '').includes('服务 A 重启完成'), '展开消息', { timeout: 3000 })
    const text = await page.evaluate(() => document.body.textContent ?? '')
    for (const t of ['服务 A 重启完成', '服务 B 发布成功', '服务 C 容量告警', '10:01']) {
      assert.ok(text.includes(t), `消息渲染：${t}`)
    }
  } finally {
    await page.close()
  }
})
