/**
 * showcase 组件测试——Switch（/components/input/switch）
 *
 * 每组件一个测试文件（单独运行）：
 *   node --env-file=.env --test apps/showcase/test/comp-switch.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/input/switch'

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

test('渲染零错误 + 3 变体（通知/自动更新/disabled）', async () => {
  const page = await browser.newPage()
  try {
    const errors = await openShowcase(page, BASE, COMP_PATH)
    assert.deepEqual(errors.filter((e) => !e.includes('Failed to load resource')), [], `零错误（实际: ${errors[0] ?? '无'}）`)
    const text = await page.evaluate(() => document.body.textContent ?? '')
    for (const t of ['启用通知', '自动更新', '已禁用 (disabled)']) {
      assert.ok(text.includes(t), `变体渲染：${t}`)
    }
  } finally {
    await page.close()
  }
})

test('demo 交互：通知 开→关；自动更新 关→开（状态文字）', async () => {
  const page = await browser.newPage()
  try {
    await openShowcase(page, BASE, COMP_PATH)
    await page.waitForFunction(() => (document.body.textContent ?? '').includes('通知: 开, 自动更新: 关'), '初始状态', { timeout: 3000 })
    // 点「启用通知」→ 关
    await page.locator('main .wf-surface label', { hasText: '启用通知' }).first().click()
    await page.waitForFunction(() => (document.body.textContent ?? '').includes('通知: 关'), '通知变关', { timeout: 3000 })
    // 点「自动更新」→ 开
    await page.locator('main .wf-surface label', { hasText: '自动更新' }).first().click()
    await page.waitForFunction(() => (document.body.textContent ?? '').includes('自动更新: 开'), '自动更新变开', { timeout: 3000 })
  } finally {
    await page.close()
  }
})
