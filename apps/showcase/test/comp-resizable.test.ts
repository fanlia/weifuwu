/**
 * showcase 组件测试——Resizable（/components/resizable）——完整能力
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-resizable.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/resizable'

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

test('能力：拖拽分隔条（面板宽度变化）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    const box = await page.locator('main [class*="resizable"] [class*="split"], main [class*="resizable"] [class*="divider"], main [class*="resizable"] [class*="handle"]').first().boundingBox()
    assert.ok(box, '分隔条')
    // 拖拽（左移 50px → 左面板变宽）
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width / 2 - 50, box.y + box.height / 2, { steps: 4 })
    await page.mouse.up()
    await page.waitForTimeout(400)
    // 左面板宽度变化（拖拽后 > 180？——或分隔条位置变化）
    const sep = await page.locator('main [class*="resizable"] [class*="split"], main [class*="resizable"] [class*="divider"], main [class*="resizable"] [class*="handle"]').first().boundingBox()
    assert.ok(sep && Math.abs(sep.x - box.x) > 20, `分隔条移动（${box.x} → ${sep?.x}）`)
  } finally { await page.close() }
})
