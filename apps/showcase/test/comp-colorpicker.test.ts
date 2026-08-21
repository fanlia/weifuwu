/**
 * showcase 组件测试——ColorPicker（/components/overlay/colorpicker）——完整能力
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-colorpicker.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, assertPopupGeometry, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/overlay/colorpicker'

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

test('渲染零错误 + 3 变体（默认/尺寸 sm·lg/disabled）+ 当前色显示', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    // swatch 渲染（3 个 ColorPicker）
    const swatches = await page.evaluate(() => document.querySelectorAll('main .wf-color-picker-swatch').length)
    assert.ok(swatches >= 3, `swatch 数（实际 ${swatches}）`)
    // disabled 变体（不可点击）
    assert.ok(await page.evaluate(() => !!document.querySelector('main [class*="color"][class*="disabled"], main [disabled]')), 'disabled 变体')
    // 当前色文字（默认 #4f6ef7——demo 状态显示）
    assert.ok(await page.evaluate(() => (document.body.textContent ?? '').includes('#4f6ef7')), '当前色')
    // 选色交互（场景层 deep-colorpicker 已覆盖——showcase 验证渲染面）
  } finally { await page.close() }
})
test('位置：portal 归属 + fixed + 视口内 + 色板 bottom', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    
    // 第一个 trigger 是 disabled 变体（pe:none 不可点）——用非 disabled
    await page.locator('main [class*="color-picker-trigger"]:not([class*="disabled"])').first().click()
    await assertPopupGeometry(page, { anchorSel: 'main [class*="color-picker-trigger"]:not([class*="disabled"])', dir: 'bottom', transformNone: true })
  } finally { await page.close() }
})
