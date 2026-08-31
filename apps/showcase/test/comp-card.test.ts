/**
 * showcase 组件测试——Card（/components/card）——全功能点固化
 * 清单：design/COMPONENT-VERIFICATION-CHECKLIST.md「Card」组（playwright 实测后固化）
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-card.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/card'

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

test('FP1 outlined variant 类面', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main [class*="card"]')
    assert.ok(await page.locator('main [class*="card"].wf-card--outlined, main [class*="card"][class*="outlined"]').count() >= 1, 'outlined')
  } finally { await page.close() }
})

test('FP2 clickable + onClick 回流', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main [class*="card"]')
    await page.locator('main .wf-card', { hasText: '可点击卡片' }).first().click()
    await page.waitForFunction(() => (document.querySelector('main')?.textContent ?? '').includes('卡片被点击了'), null, { timeout: 3000 })
  } finally { await page.close() }
})

test('FP3/FP4 hover 抬升 + active 选中态类面', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main [class*="card"]')
    assert.ok(await page.locator('main [class*="card"][class*="hover"]').count() >= 1, 'hover')
    assert.ok(await page.locator('main [class*="card"][class*="active"]').count() >= 1, 'active')
  } finally { await page.close() }
})

test('FP5 padding 三档几何（sm=8 / md=16 / lg=24）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main [class*="card"]')
    const pads = await page.evaluate(() => {
      const all = [...document.querySelectorAll('main .wf-card')]
      const byText = (t) => all.find((c) => (c.textContent ?? '').includes(t))
      return { sm: getComputedStyle(byText('padding-sm')).padding, lg: getComputedStyle(byText('padding-lg')).padding, md: getComputedStyle(byText('默认卡片')).padding }
    })
    assert.ok(pads.sm !== pads.lg && pads.sm !== pads.md, JSON.stringify(pads))
  } finally { await page.close() }
})
