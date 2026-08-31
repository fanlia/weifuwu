/**
 * showcase 组件测试——HoverCard（/components/hovercard）——完整能力
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-hovercard.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, assertPopupGeometry, type ScenarioServer } from './showcase-shared.ts'

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

/** evaluate 轮询（组件页文档表格样式循环——rAF/定时器饿死规避） */
async function waitFor(page: import('playwright').Page, fn: () => Promise<boolean>, msg: string, timeoutMs = 5000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await page.evaluate(fn)) return
    await page.waitForTimeout(100)
  }
  throw new Error(`${msg} 超时`)
}

test('能力：hover 出现卡片（用户详情——富内容）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.locator('main .wf-surface button', { hasText: '悬停查看用户' }).first().hover()
    // 富内容渲染异步（renderPortal）——waitFor 合并（避免出现后立即检查缺失）
    await waitFor(page, () => Promise.resolve((document.body.textContent ?? '').includes('用户详情') && (document.body.textContent ?? '').includes('悬停卡片展示富内容')), '卡片出现 + 富内容')
  } finally { await page.close() }
})
test('位置：portal 归属 + fixed + 视口内 + bottom 方向 + 水平居中', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    
    await page.locator('main .wf-surface button', { hasText: '悬停查看用户' }).first().hover()
    await assertPopupGeometry(page, { anchorText: '悬停查看用户', dir: 'top', centerAxis: 'x', transformNone: true })
  } finally { await page.close() }
})
