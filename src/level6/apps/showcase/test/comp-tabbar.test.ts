/**
 * showcase 组件测试——TabBar（/components/tabbar）——完整能力
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-tabbar.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/tabbar'

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

test('渲染零错误 + 标签（首页/消息/我的等）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    const text = await page.evaluate(() => document.body.textContent ?? '')
    const hasItem = ['首页', '消息', '我的'].some((t) => text.includes(t))
    assert.ok(hasItem, 'TabBar 项渲染')
    const items = await page.evaluate(() => document.querySelectorAll('main .wf-tab-bar-item').length)
    assert.ok(items >= 3, `TabBar 项数（实际 ${items}）`)
  } finally { await page.close() }
})

test('能力：切换（onChange——点非激活项 → 激活切换）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    // 点第 2 个 TabBar 项 → 激活 class 切换（受控 onChange 或非受控内部）
    const items = page.locator('main .wf-tab-bar-item')
    const count = await items.count()
    assert.ok(count >= 2, '至少 2 项')
    await items.nth(1).click()
    await page.waitForTimeout(400)
    const activeIdx = await page.evaluate(() => {
      const els = Array.from(document.querySelectorAll('main .wf-tab-bar-item'))
      return els.findIndex((x) => x.className.includes('active'))
    })
    assert.equal(activeIdx, 1, `切换激活（实际索引 ${activeIdx}）`)
  } finally { await page.close() }
})

test('交互：ArrowRight 键盘导航激活项右移（roving 焦点）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main .wf-tab-bar-item')
    const items = page.locator('main .wf-tab-bar-item')
    await items.first().click()
    await page.keyboard.press('ArrowRight')
    await page.waitForFunction(() => { const its = [...document.querySelectorAll('main .wf-tab-bar-item')]; return String(its[1].className).includes('--active') && !String(its[0].className).includes('--active') }, null, { timeout: 3000 })
  } finally { await page.close() }
})
