/**
 * showcase 组件测试——ImageCropper（/components/editor/imagecropper）——完整能力
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-imagecropper.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/editor/imagecropper'

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

test('能力：图片加载 + 裁剪框（canvas 渲染）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    // 图片加载（data URI SVG）→ canvas 渲染
    await page.waitForFunction(() => {
      const main = document.querySelector('main')
      return main ? main.querySelectorAll('canvas').length > 0 : false
    }, 'canvas 渲染', { timeout: 4000 })
    const canvas = await page.evaluate(() => {
      const c = document.querySelector('main canvas')
      return c ? { w: c.width, h: c.height } : null
    })
    assert.ok(canvas && canvas.w > 0 && canvas.h > 0, `canvas 尺寸（${canvas?.w}x${canvas?.h}）`)
  } finally { await page.close() }
})
