/**
 * showcase 组件测试——Confirm（/components/confirm）——全功能点固化
 * 清单：design/COMPONENT-VERIFICATION-CHECKLIST.md「Confirm」组（playwright 实测后固化）
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-confirm.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/confirm'

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

test('FP1/FP2 danger 确认框：标题+消息+确认 resolve true', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main button')
    await page.locator('main button', { hasText: '删除' }).first().click()
    await page.waitForFunction(() => (document.body.textContent ?? '').includes('确认删除'), null, { timeout: 3000 })
    const dangerBtn = page.locator('button.wf-btn--danger, button[class*="danger"]').filter({ hasText: '删除' }).last()
    await dangerBtn.click()
    await page.waitForFunction(() => (document.querySelector('main')?.textContent ?? '').includes('已删除'), null, { timeout: 3000 })
  } finally { await page.close() }
})

test('FP3 取消按钮 → resolve false 回流', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main button')
    await page.locator('main button', { hasText: '保存' }).first().click()
    await page.waitForFunction(() => (document.body.textContent ?? '').includes('保存修改'), null, { timeout: 3000 })
    const cancelBtn = page.locator('.wf-modal button, [role="dialog"] button').filter({ hasText: /取消/ }).last()
    await cancelBtn.click()
    await page.waitForFunction(() => (document.querySelector('main')?.textContent ?? '').includes('已取消'), null, { timeout: 3000 })
  } finally { await page.close() }
})

test('FP4 Escape 关闭（onClose 兜底 → resolve false）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main button')
    await page.locator('main button', { hasText: '保存' }).first().click()
    await page.waitForFunction(() => (document.body.textContent ?? '').includes('保存修改'), null, { timeout: 3000 })
    await page.keyboard.press('Escape')
    await page.waitForFunction(() => (document.querySelector('main')?.textContent ?? '').includes('已取消'), null, { timeout: 3000 })
  } finally { await page.close() }
})

test('FP5 maskClosable 默认 false：遮罩点击不关闭（危险操作防误触）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main button')
    await page.locator('main button', { hasText: '保存' }).first().click()
    await page.waitForFunction(() => (document.body.textContent ?? '').includes('保存修改'), null, { timeout: 3000 })
    await page.mouse.click(20, 300)
    await page.waitForTimeout(300)
    const stillOpen = await page.evaluate(() => !!document.querySelector('.wf-modal, [role="dialog"], .wf-confirm'))
    assert.equal(stillOpen, true, '遮罩点击后仍开')
    await page.keyboard.press('Escape')
  } finally { await page.close() }
})
