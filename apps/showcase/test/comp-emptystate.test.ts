/**
 * showcase 组件测试——EmptyState（/components/feedback/emptystate）
 *
 * 每组件一个测试文件（单独运行）：
 *   node --env-file=.env --test apps/showcase/test/comp-emptystate.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/feedback/emptystate'

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

test('demo 交互：创建项目 → 数据态 → 清空 → 回空态', async () => {
  const page = await browser.newPage()
  try {
    await openShowcase(page, BASE, COMP_PATH)
    // 初始空态
    await page.waitForFunction(() => (document.body.textContent ?? '').includes('暂无数据'), '空态', { timeout: 3000 })
    // 创建项目 → 数据态
    await page.locator('main .wf-surface button', { hasText: '创建项目' }).first().click()
    await page.waitForFunction(() => (document.body.textContent ?? '').includes('数据已添加'), '数据态', { timeout: 3000 })
    // 清空 → 回空态
    await page.locator('main .wf-surface button', { hasText: '清空' }).first().click()
    await page.waitForFunction(() => (document.body.textContent ?? '').includes('暂无数据'), '回空态', { timeout: 3000 })
  } finally {
    await page.close()
  }
})
