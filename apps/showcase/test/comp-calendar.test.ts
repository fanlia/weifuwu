/**
 * showcase 组件测试——Calendar（/components/calendar）——全功能点固化
 * 清单：design/COMPONENT-VERIFICATION-CHECKLIST.md「Calendar」组（playwright 实测后固化）
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-calendar.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/calendar'

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

test('FP1 年月标题 + 网格渲染（weekdays/weeks/cells）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main .wf-calendar')
    const title = await page.evaluate(() => document.querySelector('main .wf-calendar-title')?.textContent ?? '')
    assert.ok(title.includes('2025') && title.includes('6 月'), `受控年月：${title}`)
    assert.ok(await page.locator('main .wf-calendar-weekday').count() === 7, '7 列周头')
    assert.ok(await page.locator('main .wf-calendar-cell').count() >= 28, '≥28 日期格')
  } finally { await page.close() }
})

test('FP2 选中高亮 + 事件标记', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main .wf-calendar')
    assert.ok(await page.locator('main .wf-calendar-cell[class*="sel"]').count() >= 1, 'selectedDate=2025-06-10 高亮')
    const t = await page.evaluate(() => document.querySelector('main .wf-calendar')?.textContent ?? '')
    assert.ok(t.includes('产品评审') && t.includes('团队周会'), 'events 标题渲染')
  } finally { await page.close() }
})

test('FP3 受控翻页：prev → 5 月 → next 回 6 月（onMonthChange 回流）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main .wf-calendar')
    const nav = page.locator('main .wf-calendar-nav-btn')
    await nav.first().click()
    await page.waitForFunction(() => (document.querySelector('main .wf-calendar-title')?.textContent ?? '').includes('5 月'), null, { timeout: 3000 })
    await nav.nth(2).click()
    await page.waitForFunction(() => (document.querySelector('main .wf-calendar-title')?.textContent ?? '').includes('6 月'), null, { timeout: 3000 })
  } finally { await page.close() }
})

test('FP4 onSelectDate 回流（demo 回显）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main .wf-calendar')
    await page.locator('main .wf-calendar-cell').filter({ hasText: /^20$/ }).first().click()
    await page.waitForFunction(() => (document.querySelector('[data-cal-selected]')?.textContent ?? '').includes('2025-06-20'), null, { timeout: 3000 })
  } finally { await page.close() }
})
