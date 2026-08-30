/**
 * showcase 组件测试——Notification（/components/feedback/notification）
 *
 * 每组件一个测试文件（单独运行）：
 *   node --env-file=.env --test apps/showcase/test/comp-notification.test.ts
 *
 * 契约：命令式 ctx.notification.success/warning()——通知弹出。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, assertPopupGeometry, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/feedback/notification'

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

test('渲染零错误（组件页 + 文档）', async () => {
  const page = await browser.newPage()
  try {
    const errors = await openShowcase(page, BASE, COMP_PATH)
    assert.deepEqual(errors.filter((e) => !e.includes('Failed to load resource')), [], `零错误（实际: ${errors[0] ?? '无'}）`)
  } finally {
    await page.close()
  }
})

test('demo 交互：成功通知 → 弹出（标题+描述）', async () => {
  const page = await browser.newPage()
  try {
    await openShowcase(page, BASE, COMP_PATH)
    await page.locator('main .wf-surface button', { hasText: '成功通知' }).first().click()
    await page.waitForFunction(() => (document.body.textContent ?? '').includes('部署成功'), '通知弹出', { timeout: 3000 })
    await page.waitForFunction(() => (document.body.textContent ?? '').includes('v0.63.0 已上线'), '描述内容', { timeout: 2000 })
  } finally {
    await page.close()
  }
})

test('清理：通知自动消失 → portal 零残留（卸载语义）', async () => {
  const page = await browser.newPage()
  try {
    await openShowcase(page, BASE, COMP_PATH)
    await page.locator('main .wf-surface button', { hasText: '成功通知' }).first().click()
    await page.waitForFunction(() => (document.body.textContent ?? '').includes('部署成功'), '通知弹出', { timeout: 3000 })
    await page.waitForFunction(() => !(document.body.textContent ?? '').includes('部署成功'), '自动消失', { timeout: 8000 })
    assert.equal(await page.locator('#__wf_portal [class*="notification"]').count(), 0, 'portal 无通知残留')
  } finally {
    await page.close()
  }
})

test('demo 交互：警告通知 → 弹出', async () => {
  const page = await browser.newPage()
  try {
    await openShowcase(page, BASE, COMP_PATH)
    await page.locator('main .wf-surface button', { hasText: '警告通知' }).first().click()
    await page.waitForFunction(() => (document.body.textContent ?? '').includes('磁盘空间不足'), '警告通知', { timeout: 3000 })
  } finally {
    await page.close()
  }
})
test('位置：通知（视口）——命令式面板 fixed + 视口内', async () => {
  const page = await browser.newPage()
  try {
    await openShowcase(page, BASE, COMP_PATH)
    await page.locator('main .wf-surface button', { hasText: '成功通知' }).first().click()
    await assertPopupGeometry(page, { panelSel: '[class*="notification-container"], [class*="wf-notification"]' })
  } finally { await page.close() }
})
