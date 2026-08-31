/**
 * showcase 组件测试——HoverCard（/components/hovercard）——全功能点固化
 * 清单：design/COMPONENT-VERIFICATION-CHECKLIST.md「HoverCard」组（playwright 实测后固化）
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-hovercard.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/hovercard'

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

test('FP1/FP2 悬停展开富内容卡片 + 移出关闭', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main button')
    await page.locator('main button', { hasText: '悬停查看用户' }).first().hover()
    await page.waitForFunction(() => (document.querySelector('#__wf_portal')?.textContent ?? '').includes('用户详情'), null, { timeout: 3000 })
    await page.mouse.move(10, 300)
    await page.waitForFunction(() => !(document.querySelector('#__wf_portal')?.textContent ?? '').includes('用户详情'), null, { timeout: 3000 })
  } finally { await page.close() }
})
