/**
 * showcase 组件测试——DiffView（/components/diffview）——全功能点固化
 * 清单：design/COMPONENT-VERIFICATION-CHECKLIST.md「DiffView」组（playwright 实测后固化）
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-diffview.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/diffview'

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

test('FP1/FP2 双栏标题 + 增删行三态类', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main .wf-diffview')
    const t = await page.evaluate(() => document.querySelector('main')?.textContent ?? '')
    assert.ok(t.includes('重构前') && t.includes('重构后'), '双标题')
    const cls = await page.evaluate(() => [...new Set([...document.querySelectorAll('main [class*="diff"] *')].flatMap((e) => [...e.classList]).filter((c) => /add|remove|same/.test(c)))])
    for (const need of ['add', 'remove', 'same']) assert.ok(cls.some((c) => c.includes(need)), `${need} 行类（${cls.join(',')}）`)
  } finally { await page.close() }
})

test('FP3 折叠展开（组件层修复回归）：行数随展开状态变化 + 文案切换', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main .wf-diffview-fold')
    const foldText = await page.locator('main .wf-diffview-fold').first().textContent()
    assert.ok((foldText ?? '').includes('行未变'), `fold="${(foldText ?? '').trim()}"`)
    const before = await page.evaluate(() => document.querySelectorAll('main .wf-diffview-row').length)
    assert.equal(before, 9, `初始 9 行（2 same + 7 change——3 行 same 折叠，threshold=2）`)
    await page.locator('main .wf-diffview-fold').first().click()
    await page.waitForFunction((n) => document.querySelectorAll('main .wf-diffview-row').length > n, before, { timeout: 3000 })
    // 展开态文案 = 收起提示（2027-XX 修复——原「展开中」误导）
    const openText = await page.evaluate(() => document.querySelector('main .wf-diffview-fold')?.textContent?.trim())
    assert.equal(openText, '收起未变行', `展开后 fold 文案`)
    // 再点收起 → 行数回落
    await page.locator('main .wf-diffview-fold').first().click()
    await page.waitForFunction((n) => document.querySelectorAll('main .wf-diffview-row').length === n, before, { timeout: 3000 })
  } finally { await page.close() }
})
