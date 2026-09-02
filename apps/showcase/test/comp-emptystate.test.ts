/**
 * showcase 组件测试——EmptyState（/components/emptystate）——全功能点固化
 * 清单：「EmptyState」组（playwright 实测后固化）
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-emptystate.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/emptystate'

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

test('FP1-4 空态：icon + text + hint + children 操作按钮（切换面）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main [class*="empty"]')
    const t = await page.evaluate(() => document.querySelector('main')?.textContent ?? '')
    assert.ok(t.includes('暂无数据') && t.includes('点击按钮创建第一个项目'), 'text+hint')
    assert.ok(await page.locator('main [class*="empty"] svg, main [class*="empty"] .wf-icon').count() >= 1, 'icon')
    await page.locator('main button', { hasText: '创建项目' }).first().click()
    await page.waitForFunction(() => (document.querySelector('main')?.textContent ?? '').includes('数据已添加'), null, { timeout: 3000 })
    await page.locator('main button', { hasText: '清空' }).first().click()
    await page.waitForFunction(() => (document.querySelector('main')?.textContent ?? '').includes('暂无数据'), null, { timeout: 3000 })
  } finally { await page.close() }
})
