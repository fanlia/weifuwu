/**
 * showcase 组件测试——Popover（/components/overlay/popover）——完整能力
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-popover.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, assertPopupGeometry, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/overlay/popover'

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

test('渲染零错误 + 点击弹出（自定义内容）+ hover 触发', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    // 点击弹出（自定义面板内容）
    await page.locator('main .wf-surface button', { hasText: '点击弹出' }).first().click()
    await waitFor(page, () => Promise.resolve((document.body.textContent ?? '').includes('自定义面板内容')), '弹层出现')
    assert.ok(await page.evaluate(() => !!document.querySelector('.wf-popover, .wf-popup')), '弹层面板')
    // Escape 关闭
    await page.keyboard.press('Escape')
    await waitFor(page, () => Promise.resolve(!(document.body.textContent ?? '').includes('自定义面板内容')), 'Escape 关闭')
    // hover 触发（悬停查看）
    await page.locator('main .wf-surface span', { hasText: '悬停查看' }).first().hover()
    await waitFor(page, () => Promise.resolve((document.body.textContent ?? '').includes('悬停出现的面板')), 'hover 弹层')
  } finally { await page.close() }
})
test('位置：portal 归属 + fixed + 视口内 + bottom 方向 + 水平居中', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    
    await page.locator('main .wf-surface span', { hasText: '悬停查看' }).first().hover()
    await assertPopupGeometry(page, { anchorText: '悬停查看', dir: 'bottom', centerAxis: 'x', transformNone: true })
  } finally { await page.close() }
})
