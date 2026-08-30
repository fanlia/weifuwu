/**
 * showcase 组件测试——Layout（/components/core/layout）——完整能力
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-layout.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/core/layout'

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

test('能力：Header/Content/Footer 渲染 + Sider 折叠切换（受控 onCollapse 回流）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    const header = page.locator('main .wf-layout-header').first()
    assert.ok((await header.textContent())?.includes('顶部栏'), 'Header 渲染')
    assert.ok((await page.locator('main .wf-layout-content').first().textContent())?.includes('主内容区'), 'Content 渲染')
    assert.ok((await page.locator('main .wf-layout-footer').first().textContent())?.includes('© 2026'), 'Footer 渲染')
    // Sider 折叠：点击 trigger → 宽度收窄（collapsed 受控——onCollapse → 重渲染）
    const sider = page.locator('main .wf-layout-sider').first()
    const w0 = await sider.evaluate((el) => el.getBoundingClientRect().width)
    await page.locator('main .wf-layout-sider-trigger').first().click()
    await page.waitForTimeout(200)
    await page.waitForFunction(() => {
      const el = document.querySelector('main .wf-layout-sider')
      return el ? el.getBoundingClientRect().width < 150 : false
    }, '折叠后宽度收窄')
    const w1 = await sider.evaluate((el) => el.getBoundingClientRect().width)
    assert.ok(w1 < w0 * 0.5, `折叠宽度（${w0}→${w1}）`)
    // 再点恢复
    await page.locator('main .wf-layout-sider-trigger').first().click()
    await page.waitForFunction(() => {
      const el = document.querySelector('main .wf-layout-sider')
      return el ? el.getBoundingClientRect().width > 150 : false
    }, '恢复展开')
  } finally { await page.close() }
})
