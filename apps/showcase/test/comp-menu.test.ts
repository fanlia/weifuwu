/**
 * showcase 组件测试——Menu（/components/menu）——全功能点固化
 * 清单：「Menu」组（playwright 实测后固化）
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-menu.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/menu'

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

test('FP1/FP2 分组 + 选中高亮回流 + 子菜单', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main .wf-menu-label')
    const t = await page.evaluate(() => document.querySelector('main')?.textContent ?? '')
    assert.ok(t.includes('工作台') && t.includes('仪表盘') && t.includes('系统管理'), '分组+项+子菜单')
    await page.locator('main .wf-menu-label').filter({ hasText: '部门' }).first().click()
    // active 类在父元素 .wf-menu-item--act
    await page.waitForFunction(() => [...document.querySelectorAll('main .wf-menu-item')].some((i) => (i.className || '').includes('--act') && (i.textContent ?? '').includes('部门')), null, { timeout: 3000 })
  } finally { await page.close() }
})

test('FP3 折叠：宽度 202→56 收窄（collapsible）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main .wf-menu-collapse-btn')
    const w0 = await page.evaluate(() => document.querySelector('main [class*="menu"]')?.getBoundingClientRect().width ?? 0)
    await page.locator('main .wf-menu-collapse-btn').first().click()
    await page.waitForFunction((w) => (document.querySelector('main [class*="menu"]')?.getBoundingClientRect().width ?? 999) < w, w0, { timeout: 3000 })
  } finally { await page.close() }
})
