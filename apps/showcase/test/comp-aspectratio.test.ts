/**
 * showcase 组件测试——AspectRatio（/components/core/aspectratio）——完整功能
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-aspectratio.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/core/aspectratio'

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
}

test('渲染零错误 + 16:9 容器（宽高比）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    const info = await page.evaluate(() => {
      const el = document.querySelector('main [class*="aspect"]')
      const r = el?.getBoundingClientRect()
      return r ? { w: r.width, h: r.height, ratio: r.width / r.height } : null
    })
    assert.ok(info, '16:9 容器（aspect 类）')
    assert.ok(Math.abs(info.ratio - 16 / 9) < 0.05, `宽高比 ${info.ratio.toFixed(2)}（期望 1.78——实际 ${info.w.toFixed(0)}x${info.h.toFixed(0)}）`)
  } finally {
    await page.close()
  }
})
