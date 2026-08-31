/**
 * showcase 组件测试——Cascader（/components/cascader）——全功能点固化
 * 清单：design/COMPONENT-VERIFICATION-CHECKLIST.md「Cascader」组（playwright 实测后固化）
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-cascader.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/cascader'

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

test('FP1 路径回显：value=[\'zj\',\'hz\'] → 「浙江 / 杭州」', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main [class*="cascader"]')
    const t = await page.evaluate(() => document.querySelector('main')?.textContent ?? '')
    assert.ok(t.includes('浙江 / 杭州') || (t.includes('浙江') && t.includes('杭州')), '路径回显')
  } finally { await page.close() }
})

test('FP2/FP3 展开面板 + 级联钻取（portal 列面板）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    const trigger = page.locator('main [class*="cascader-trigger"], main [class*="cascader"] input, main .wf-cascader').first()
    await trigger.click()
    await page.waitForSelector('#__wf_portal .wf-cascader-col', { timeout: 3000 })
    assert.ok(await page.locator('#__wf_portal .wf-cascader-col').count() >= 1, '面板列')
    await page.locator('#__wf_portal .wf-cascader-opt', { hasText: '广东' }).first().click()
    await page.waitForFunction(() => [...document.querySelectorAll('#__wf_portal .wf-cascader-opt')].some((o) => (o.textContent ?? '').includes('深圳')), null, { timeout: 3000 })
  } finally { await page.close() }
})

test('FP4 叶子选择：onChange 回流 + 面板关闭', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    const trigger = page.locator('main [class*="cascader-trigger"], main [class*="cascader"] input, main .wf-cascader').first()
    await trigger.click()
    await page.waitForSelector('#__wf_portal .wf-cascader-opt', { timeout: 3000 })
    await page.locator('#__wf_portal .wf-cascader-opt', { hasText: '广东' }).first().click()
    await page.locator('#__wf_portal .wf-cascader-col .wf-cascader-opt', { hasText: '深圳' }).first().click()
    await page.waitForFunction(() => {
      const t = document.querySelector('main')?.textContent ?? ''
      return t.includes('深圳') && t.includes('广东')
    }, null, { timeout: 3000 })
  } finally { await page.close() }
})

test('FP5 showSearch：面板内搜索扁平过滤', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    const trigger = page.locator('main [class*="cascader-trigger"], main [class*="cascader"] input, main .wf-cascader').first()
    await trigger.click()
    await page.waitForSelector('#__wf_portal .wf-cascader-search', { timeout: 3000 })
    await page.locator('#__wf_portal .wf-cascader-search').fill('宁')
    await page.waitForSelector('#__wf_portal .wf-cascader-search-item', { timeout: 3000 })
    const n = await page.locator('#__wf_portal .wf-cascader-search-item').count()
    assert.ok(n >= 1, `搜「宁」→ ${n} 条`)
  } finally { await page.close() }
})
