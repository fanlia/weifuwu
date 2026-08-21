/**
 * showcase 组件测试——Confirm（/components/feedback/confirm）
 *
 * 每组件一个测试文件（单独运行）：
 *   node --env-file=.env --test apps/showcase/test/comp-confirm.test.ts
 *
 * 契约：命令式 ctx.confirm()——确认弹窗 → resolve(boolean)——结果文字。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/feedback/confirm'

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

test('demo 交互：删除 → 确认弹窗 → 确认 → 结果「已删除」', async () => {
  const page = await browser.newPage()
  try {
    await openShowcase(page, BASE, COMP_PATH)
    // 点「删除」（danger 按钮——demo 区）
    await page.locator('main .wf-surface button', { hasText: '删除' }).first().click()
    // 确认弹窗出现（mask + 标题「确认删除」）
    await page.waitForFunction(() => (document.body.textContent ?? '').includes('确认删除'), '确认弹窗', { timeout: 3000 })
    // 确认（danger 按钮「删除」）
    await page.locator('.wf-popup-mask button, #__wf_portal button', { hasText: '删除' }).first().click()
    // 结果文字
    await page.waitForFunction(() => (document.body.textContent ?? '').includes('已删除'), '结果「已删除」', { timeout: 3000 })
  } finally {
    await page.close()
  }
})

test('demo 交互：保存 → 取消 → 结果「已取消」', async () => {
  const page = await browser.newPage()
  try {
    await openShowcase(page, BASE, COMP_PATH)
    await page.locator('main .wf-surface button', { hasText: '保存' }).first().click()
    await page.waitForFunction(() => (document.body.textContent ?? '').includes('保存修改'), '确认弹窗', { timeout: 3000 })
    // 取消
    await page.locator('.wf-popup-mask button, #__wf_portal button', { hasText: '取消' }).first().click()
    await page.waitForFunction(() => (document.body.textContent ?? '').includes('已取消'), '结果「已取消」', { timeout: 3000 })
  } finally {
    await page.close()
  }
})
