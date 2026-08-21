/**
 * showcase 组件测试——Img（/components/display/img）——完整能力
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-img.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/display/img'

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

test('渲染零错误 + 多图（尺寸/圆角/fallback/preview）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    const imgs = await page.evaluate(() => document.querySelectorAll('main img').length)
    assert.ok(imgs >= 3, `img 数（实际 ${imgs}）`)
    // fallback 图（/broken.jpg 加载失败 → fallback data URI——alt 渲染）
    const fallback = await page.evaluate(() => {
      const imgs = Array.from(document.querySelectorAll('main img'))
      return imgs.some((i) => i.getAttribute('alt')?.includes('fallback'))
    })
    assert.ok(fallback, 'fallback 变体')
    // preview（点击放大——cursor zoom-in）
    const preview = await page.evaluate(() => {
      const imgs = Array.from(document.querySelectorAll('main img'))
      const p = imgs.find((i) => i.getAttribute('alt')?.includes('preview'))
      return p ? getComputedStyle(p).cursor : ''
    })
    assert.ok(preview.includes('zoom'), `preview 光标（实际 ${preview}）`)
  } finally { await page.close() }
})
