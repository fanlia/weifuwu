/**
 * showcase 组件测试——Popconfirm（/components/overlay/popconfirm）——完整能力
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-popconfirm.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/overlay/popconfirm'

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

/** evaluate 轮询（组件页文档表格样式循环——rAF/定时器饿死规避） */
async function waitFor(page: import('playwright').Page, fn: () => Promise<boolean>, msg: string, timeoutMs = 5000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await page.evaluate(fn)) return
    await page.waitForTimeout(100)
  }
  throw new Error(`${msg} 超时`)
}

test('渲染零错误 + 点击弹出确认 + 确认回调（已删除——toast 或状态）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.locator('main .wf-surface button', { hasText: '删除' }).first().click()
    // portal 弹层出现（role=dialog——aria-label 不算 textContent）
    await waitFor(page, () => Promise.resolve(!!document.querySelector('#__wf_portal [class*="popconfirm"]')), '确认弹层')
    // 确认（portal 内确认按钮——onConfirm 回调）
    await page.locator('#__wf_portal [class*="popconfirm"] button').last().click()
    await waitFor(page, () => Promise.resolve(!document.querySelector('#__wf_portal [class*="popconfirm"]')), '确认关闭（onConfirm——portal 移除）')
  } finally { await page.close() }
})
