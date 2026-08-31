/**
 * showcase 组件测试——Dropdown（/components/dropdown）——完整能力
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-dropdown.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, assertPopupGeometry, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/dropdown'

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

test('渲染零错误 + 点击展开 + 项点击（上次: 编辑）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.locator('main .wf-surface button', { hasText: '操作 ▾' }).first().click()
    await waitFor(page, () => Promise.resolve((document.body.textContent ?? '').includes('复制')), '下拉展开')
    await page.locator('.wf-popup button, #__wf_portal button', { hasText: '编辑' }).first().click()
    await waitFor(page, () => Promise.resolve((document.body.textContent ?? '').includes('上次: 编辑')), '项点击回调')
    // 关闭后 portal 无残留（核心层修复验证——混合数组 unkeyed 移除）
    const residual = await page.evaluate(() => {
      const p = document.querySelector('#__wf_portal')
      return p ? p.textContent?.includes('复制') ?? false : false
    })
    assert.ok(!residual, 'portal 无残留（核心层修复受益）')
  } finally { await page.close() }
})
test('位置：portal 归属 + fixed + 视口内 + bottom 方向 + 水平居中', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    
    await page.locator('main .wf-surface button', { hasText: '操作' }).first().click()
    await assertPopupGeometry(page, { panelText: '编辑', anchorText: '操作', dir: 'bottom', centerAxis: 'x', transformNone: true })
  } finally { await page.close() }
})
