/**
 * showcase 组件测试——DatePicker（/components/datepicker）——全功能点固化
 * 清单：design/COMPONENT-VERIFICATION-CHECKLIST.md「DatePicker」组（playwright 实测后固化）
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-datepicker.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/datepicker'

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

test('FP1/FP2 date 模式：面板展开 + 点格回流（已选: 2026-XX-15）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main input[placeholder="选择日期"]')
    await page.locator('main input[placeholder="选择日期"]').first().click()
    await page.waitForSelector('#__wf_portal .wf-datepicker-dropdown', { timeout: 3000 })
    const title = await page.evaluate(() => document.querySelector('#__wf_portal')?.textContent ?? '')
    assert.ok(/\d{4}年\d+月/.test(title), `年月标题`)
    await page.locator('#__wf_portal .wf-datepicker-cell').filter({ hasText: /^15$/ }).first().click()
    await page.waitForFunction(() => /已选: \d{4}-\d{2}-15/.test(document.querySelector('main')?.textContent ?? ''), null, { timeout: 3000 })
  } finally { await page.close() }
})

test('FP3 time 模式：时/分列 + 确认（命名空间 portal）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main input[placeholder="选择时间"]')
    await page.locator('main input[placeholder="选择时间"]').first().click()
    await page.waitForFunction(() => {
      const root = document.querySelector('#__wf_portal-dp-calendar') ?? document.querySelector('#__wf_portal')
      const t = root?.textContent ?? ''
      return t.includes('时') && t.includes('分') && t.includes('确定')
    }, null, { timeout: 3000 })
    assert.ok(await page.locator('#__wf_portal-dp-calendar .wf-time-opt').count() >= 24, '时列 24 项')
  } finally { await page.close() }
})

test('FP4 datetime：日历+时间 select → 选日改时 → 确定回流完整时间戳', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main input[placeholder="日期+时间"]')
    await page.locator('main input[placeholder="日期+时间"]').first().click()
    await page.waitForSelector('[id^="__wf_portal"] .wf-datetime-select', { timeout: 3000 })
    await page.locator('[id^="__wf_portal"] .wf-datepicker-cell').filter({ hasText: /^18$/ }).first().click()
    const selects = page.locator('[id^="__wf_portal"] .wf-datetime-select')
    await selects.nth(0).selectOption('10')
    await selects.nth(1).selectOption('30')
    await page.locator('[id^="__wf_portal"] button', { hasText: '确定' }).last().click()
    await page.waitForFunction(() => /已选: \d{4}-\d{2}-18 10:30/.test(document.querySelector('main')?.textContent ?? ''), null, { timeout: 3000 })
  } finally { await page.close() }
})

test('FP5 range 模式：双月面板展开', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main input[placeholder="日期范围"]')
    await page.locator('main input[placeholder="日期范围"]').first().click()
    await page.waitForSelector('[id^="__wf_portal"] .wf-datepicker-range-panel', { timeout: 3000 })
    assert.equal(await page.locator('[id^="__wf_portal"] .wf-datepicker-range-panel').count(), 2, '双月面板')
  } finally { await page.close() }
})
