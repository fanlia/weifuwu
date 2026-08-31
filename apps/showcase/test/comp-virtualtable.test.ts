/**
 * showcase 组件测试——VirtualTable（/components/virtualtable）——完整能力
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-virtualtable.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/virtualtable'

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

test('能力：虚拟表格（10000 行——表头 + 排序 + 滚动）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    const text = await page.evaluate(() => document.body.textContent ?? '')
    for (const t of ['ID', '用户名', '邮箱', '用户1']) assert.ok(text.includes(t), `表格：${t}`)
    // 排序（点「用户名」表头——wf-virtual-table-th——sortable）
    const th = page.locator('.wf-virtual-table-th', { hasText: '用户名' }).first()
    assert.ok(await th.count() > 0, '用户名表头')
    await th.click()
    await page.waitForTimeout(300)
    // 滚动（表格容器——虚拟化窗口移动——中部行渲染）
    const scrolled = await page.evaluate(() => {
      const el = document.querySelector('.wf-virtual-table-body')
      if (!el) return false
      el.scrollTop = 138760
      return true
    })
    assert.ok(scrolled, '表格滚动容器')
    await page.waitForTimeout(600)
    // 滚动后窗口移动（首行 ≠ 用户1——字典序中部行渲染）
    const first = await page.evaluate(() => document.querySelector('.wf-virtual-table-row')?.textContent?.slice(0, 6) ?? '')
    assert.ok(!first.startsWith('用户1') && first.length > 0, `窗口移动（首行 ${first}）`)
  } finally { await page.close() }
})

test('交互：列头 focus + Enter 触发排序（onSort——字典序）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('[tabindex="0"]')
    const th = page.locator('[tabindex="0"]').first()
    const rowText = () => page.evaluate(() => document.querySelectorAll('.wf-virtual-table-row')[1]?.textContent?.slice(0, 16))
    const before = await rowText()
    await th.focus()
    await page.keyboard.press('Enter')
    await page.waitForFunction((t) => document.querySelectorAll('.wf-virtual-table-row')[1]?.textContent?.slice(0, 16) !== t, before, { timeout: 3000 })
  } finally { await page.close() }
})
