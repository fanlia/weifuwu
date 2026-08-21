/**
 * showcase 组件测试——LogViewer（/components/display/logviewer）——完整能力
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-logviewer.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/display/logviewer'

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

test('渲染零错误 + ANSI 日志行（✓/⚠/✗ 颜色）+ 追加（模拟流）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    const text = await page.evaluate(() => document.body.textContent ?? '')
    for (const t of ['服务启动', '连接数据库', '等待请求', '慢查询警告', '请求失败', '重试成功']) assert.ok(text.includes(t), `日志行：${t}`)
    // 追加日志（模拟流——点「追加日志」→ 新行出现）
    const before = await page.evaluate(() => (document.querySelector('main [class*="log"]')?.textContent ?? '').length)
    await page.locator('main .wf-surface button', { hasText: '追加日志' }).first().click()
    await page.waitForTimeout(400)
    const after = await page.evaluate(() => (document.querySelector('main [class*="log"]')?.textContent ?? '').length)
    assert.ok(after > before, `追加生效（${before} → ${after}）`)
  } finally { await page.close() }
})
