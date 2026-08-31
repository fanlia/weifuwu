/**
 * showcase 组件测试——Notification（/components/notification）——全功能点固化
 * 清单：design/COMPONENT-VERIFICATION-CHECKLIST.md「Notification」组（playwright 实测后固化）
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-notification.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/notification'

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

test('FP1-3 success 弹出 + 4.5s 自动消失 + warning', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main button')
    await page.locator('main button', { hasText: '成功通知' }).first().click()
    await page.waitForFunction(() => (document.body.textContent ?? '').includes('部署成功'), null, { timeout: 3000 })
    await page.waitForFunction(() => !(document.body.textContent ?? '').includes('部署成功'), null, { timeout: 6000 })
    await page.locator('main button', { hasText: '警告通知' }).first().click()
    await page.waitForFunction(() => (document.body.textContent ?? '').includes('磁盘空间不足'), null, { timeout: 3000 })
  } finally { await page.close() }
})
