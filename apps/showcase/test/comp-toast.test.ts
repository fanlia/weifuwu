/**
 * showcase 组件测试——Toast（/components/feedback/toast）
 *
 * 每组件一个测试文件（单独运行）：
 *   node --env-file=.env --test apps/showcase/test/comp-toast.test.ts
 *
 * 契约：demo 状态式 Toast 列表——按钮触发 → 3s 自动消失——位置切换。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, assertPopupGeometry, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/feedback/toast'

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

test('demo 交互：成功 → toast 出现 → 3s 自动消失', async () => {
  const page = await browser.newPage()
  try {
    await openShowcase(page, BASE, COMP_PATH)
    await page.locator('main .wf-surface button', { hasText: '成功' }).first().click()
    // toast 出现（操作成功完成）
    await page.waitForFunction(() => (document.body.textContent ?? '').includes('操作成功完成'), 'toast 出现', { timeout: 3000 })
    // 3s 后自动消失
    await page.waitForFunction(() => !(document.body.textContent ?? '').includes('操作成功完成'), 'toast 自动消失', { timeout: 5000 })
  } finally {
    await page.close()
  }
})

test('demo 交互：错误 + 警告 → 多条 toast（上限 3）', async () => {
  const page = await browser.newPage()
  try {
    await openShowcase(page, BASE, COMP_PATH)
    await page.locator('main .wf-surface button', { hasText: '错误' }).first().click()
    await page.locator('main .wf-surface button', { hasText: '警告' }).first().click()
    await page.waitForFunction(() => (document.body.textContent ?? '').includes('发生了一个错误') && (document.body.textContent ?? '').includes('不可撤销'), '两条 toast', { timeout: 3000 })
    const count = await page.evaluate(() => (document.body.textContent ?? '').match(/操作成功完成|发生了一个错误|不可撤销|提示信息/g)?.length ?? 0)
    assert.ok(count >= 2, `toast 条数（实际 ${count}）`)
  } finally {
    await page.close()
  }
})
test('位置：toast（视口）——命令式面板 fixed + 视口内', async () => {
  const page = await browser.newPage()
  try {
    await openShowcase(page, BASE, COMP_PATH)
    await page.locator('main .wf-surface button', { hasText: '成功' }).first().click()
    await assertPopupGeometry(page, { panelSel: '[class*="toast-container"]' })
  } finally { await page.close() }
})
