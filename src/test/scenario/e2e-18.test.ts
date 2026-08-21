/**
 * 组件切换残留（PatternLive 场景——SPA 导航 demo 混合回归）
 * A（含 nav）→ 列表 → B（同位置）——旧 DOM（nav）不得复活（procRemove 清子树）
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser, type Page } from 'playwright'
import { startScenarioServer, openScenario, type ScenarioServer } from './e2e-shared.ts'

let server: ScenarioServer
let BASE = ''
let browser: Browser

test.before(async () => {
  server = await startScenarioServer()
  BASE = server.base
  browser = await chromium.launch()
})

test.after(async () => {
  await browser?.close()
  server?.stop()
})

test('pattern-reuse：A → 列表 → B——A 的 nav 不复活（procRemove 清子树）', async () => {
  const page: Page = await browser.newPage()
  try {
    await openScenario(page, BASE, 'pattern-reuse')
    // 页面 A：nav 在
    assert.equal(await page.locator('.pr-nav-a').count(), 1, 'A 页 nav 渲染')
    // → 列表
    await page.click('.pr-to-list')
    await page.waitForFunction(() => !!document.querySelector('.pr-list'), '列表页', { timeout: 3000 })
    assert.equal(await page.locator('.pr-nav-a').count(), 0, '列表页 nav 移除')
    // → B（同位置组件切换——PatternLive 场景）
    await page.click('.pr-to-b')
    await page.waitForFunction(() => !!document.querySelector('.pr-file-b'), 'B 渲染', { timeout: 3000 })
    // 断言：A 的 nav 不复活（procRemove 清子树 nodes——旧 DOM 复用修复）
    assert.equal(await page.locator('.pr-nav-a').count(), 0, 'B 页 A 的 nav 不复活（残留）')
    assert.equal(await page.locator('.pr-file-b').count(), 1, 'B 文件树渲染')
    // B 的 aside 里无 A 的 nav
    const asideHasNav = await page.evaluate(() => {
      const aside = document.querySelector('main aside')
      return !!aside?.querySelector('.pr-nav-a')
    })
    assert.equal(asideHasNav, false, 'aside 内无 A nav 残留')
  } finally {
    await page.close()
  }
})
