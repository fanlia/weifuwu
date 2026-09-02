/**
 * showcase 组件测试——CopyButton（/components/copybutton）——全功能点固化
 * 清单：「CopyButton」组（playwright 实测后固化）
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-copybutton.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/copybutton'

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

test('FP1/FP2 复制 → 剪贴板 = value + 成功反馈', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
    await page.waitForSelector('main button')
    await page.locator('main button', { hasText: '复制链接' }).first().click()
    await page.waitForTimeout(300)
    const clip = await page.evaluate(() => navigator.clipboard.readText().catch(() => 'FAIL'))
    assert.equal(clip, 'https://weifuwu.dev/docs', `剪贴板=${clip}`)
    const t = await page.evaluate(() => document.querySelector('main')?.textContent ?? '')
    assert.ok(t.includes('已复制'), '成功反馈')
  } finally { await page.close() }
})

test('FP3 iconOnly：无文本 + aria-label', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
    await page.waitForSelector('main button')
    const icon = page.locator('main button[aria-label="复制"]').first()
    assert.equal(await icon.textContent(), '', '无文本')
    await icon.click()
    // iconOnly 反馈面 = 图标变 check + --copied 类（无文字——icon 按钮保持尺寸的设计契约）
    await page.waitForSelector('main .wf-copy-btn--copied', { timeout: 3000 })
    await page.waitForTimeout(300)
    const clip = await page.evaluate(() => navigator.clipboard.readText().catch(() => 'FAIL'))
    assert.equal(clip, '仅图标', 'icon-only 剪贴板')
  } finally { await page.close() }
})
