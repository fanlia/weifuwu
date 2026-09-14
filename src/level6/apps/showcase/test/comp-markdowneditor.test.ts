/**
 * showcase 组件测试——MarkdownEditor（/components/markdowneditor）——全功能点固化
 * 清单：「MarkdownEditor」组（playwright 实测后固化）
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-markdowneditor.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/markdowneditor'

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

test('FP1/FP2 分屏初值 + 输入实时预览（onChange→Markdown 渲染）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main textarea')
    assert.ok(await page.evaluate(() => [...document.querySelectorAll('main h1')].length >= 1), '预览 h1')
    const ta = page.locator('main textarea').first()
    await ta.fill('# 新标题')
    await ta.pressSequentially('\n\n**实时加粗**')
    await page.waitForFunction(() => [...document.querySelectorAll('main strong, main b')].some((s) => (s.textContent ?? '').includes('实时加粗')), null, { timeout: 3000 })
  } finally { await page.close() }
})

test('FP3 模式切换：预览（textarea 消失）↔ 编辑（textarea 回归）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main textarea')
    await page.locator('main button', { hasText: '预览' }).first().click()
    await page.waitForFunction(() => document.querySelectorAll('main textarea').length === 0, null, { timeout: 3000 })
    await page.locator('main button', { hasText: '编辑' }).first().click()
    await page.waitForSelector('main textarea', { timeout: 3000 })
  } finally { await page.close() }
})
