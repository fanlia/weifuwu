/**
 * showcase 组件测试——ImageCropper（/components/imagecropper）——全功能点固化
 * 清单：design/COMPONENT-VERIFICATION-CHECKLIST.md「ImageCropper」组（playwright 实测后固化）
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-imagecropper.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/imagecropper'

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

test('FP1/FP2 canvas 绘制 + 裁剪按钮 → onCrop dataURL（ctx2.onCrop 断链修复回归）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main canvas', { timeout: 5000 })
    // 等图片加载（canvas 宽从默认 320 变为视图宽 480）
    await page.waitForFunction(() => document.querySelector('main canvas')?.width === 480, null, { timeout: 5000 })
    const cropPromise = page.waitForEvent('console', {
      predicate: (m) => m.text().includes('[crop]') && m.text().includes('data:image'),
      timeout: 5000,
    })
    await page.locator('main .wf-imagecropper button', { hasText: '裁剪' }).first().click()
    await cropPromise
  } finally { await page.close() }
})

test('FP3 裁剪框拖拽（useDrag）不报错', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main canvas', { timeout: 5000 })
    await page.waitForFunction(() => document.querySelector('main canvas')?.width === 480, null, { timeout: 5000 })
    const pos = await page.evaluate(() => {
      const r = document.querySelector('main canvas').getBoundingClientRect()
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
    })
    await page.mouse.move(pos.x, pos.y)
    await page.mouse.down()
    await page.mouse.move(pos.x + 30, pos.y + 20, { steps: 4 })
    await page.mouse.up()
  } finally { await page.close() }
})
