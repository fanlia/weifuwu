/**
 * showcase 组件测试——NavMenu（/components/navmenu）——全功能点固化
 * 清单：design/COMPONENT-VERIFICATION-CHECKLIST.md「NavMenu」组（playwright 实测后固化）
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-navmenu.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/navmenu'

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

test('FP1/FP2 顶栏项 + hover 弹出子菜单（NavigationMenu 语义）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main [class*="navmenu"]')
    const t = await page.evaluate(() => document.querySelector('main')?.textContent ?? '')
    assert.ok(t.includes('首页') && t.includes('文档') && t.includes('关于'), '顶栏三项')
    await page.locator('main [class*="navmenu"] [class*="item"], main [role="menuitem"]').filter({ hasText: '文档' }).first().hover()
    await page.waitForFunction(() => ((document.querySelector('#__wf_portal')?.textContent ?? '') + (document.querySelector('main')?.textContent ?? '')).includes('指南'), null, { timeout: 3000 })
  } finally { await page.close() }
})

test('交互：focus + Enter 激活菜单项', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main [class*="navmenu"]')
    const item = page.locator('main [class*="navmenu"] [class*="item"], main [role="menuitem"]').first()
    await item.focus()
    await page.keyboard.press('Enter')
    await page.waitForFunction(() => [...document.querySelectorAll('main [class*="navmenu"] *')].some((x) => /--a|active/.test(String(x.className))), null, { timeout: 3000 })
  } finally { await page.close() }
})
