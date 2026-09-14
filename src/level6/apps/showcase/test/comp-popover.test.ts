/**
 * showcase 组件测试——Popover（/components/popover）——全功能点固化
 * 清单：「Popover」组（playwright 实测后固化）
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-popover.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, assertPopupGeometry, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/popover'

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

test('FP1 点击触发弹出 + Escape 关闭', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main button')
    await page.locator('main button').first().click()
    await page.waitForFunction(() => (document.querySelector('#__wf_portal')?.textContent ?? '').length > 0, null, { timeout: 3000 })
    await page.keyboard.press('Escape')
    await page.waitForFunction(() => (document.querySelector('#__wf_portal')?.textContent ?? '').length === 0, null, { timeout: 3000 })
  } finally { await page.close() }
})

test('位置：portal 归属 + fixed + 视口内 + bottom 方向 + 水平居中', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.locator('main .wf-surface span', { hasText: '悬停查看' }).first().hover()
    await assertPopupGeometry(page, { anchorText: '悬停查看', dir: 'bottom', centerAxis: 'x', transformNone: true })
  } finally { await page.close() }
})
