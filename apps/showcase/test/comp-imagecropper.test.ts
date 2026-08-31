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

// ── L2 交互路径断言（2027-09 死交互修复回归——拖拽选区主路径）──

const pngSize = (page: import('playwright').Page, durl: string) =>
  page.evaluate((d) => {
    const bin = atob(d.split(',')[1])
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    const dv = new DataView(bytes.buffer)
    return { w: dv.getUint32(16), h: dv.getUint32(20) }
  }, durl)

test('交互：拖动裁剪框 → canvas 像素变化（框移动主路径）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main canvas')
    await page.waitForFunction(() => { const c = document.querySelector('main canvas') as HTMLCanvasElement | null; return c && c.width > 320 }, null, { timeout: 3000 })
    const box = await page.locator('main canvas').first().boundingBox()
    const data0 = await page.evaluate(() => (document.querySelector('main canvas') as HTMLCanvasElement).toDataURL().length)
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width * 0.5 + 40, box.y + box.height * 0.5 + 25, { steps: 6 })
    await page.mouse.up()
    await page.waitForFunction((n) => (document.querySelector('main canvas') as HTMLCanvasElement).toDataURL().length !== n, data0, { timeout: 3000 })
  } finally { await page.close() }
})

test('交互：拖右下柄等比缩放 → crop 输出放大且保持 aspect 4/3 + 重置回位', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main canvas')
    await page.waitForFunction(() => { const c = document.querySelector('main canvas') as HTMLCanvasElement | null; return c && c.width > 320 }, null, { timeout: 3000 })
    const box = await page.locator('main canvas').first().boundingBox()
    const cropBtn = page.locator('main button').filter({ hasText: '裁剪' }).first()
    await cropBtn.click()
    await page.waitForFunction(() => (window as any).__lastCrop, null, { timeout: 3000 })
    const base = await pngSize(page, await page.evaluate(() => (window as any).__lastCrop))
    await page.mouse.move(box.x + box.width * 0.92, box.y + box.height * 0.94)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width * 0.92 + 30, box.y + box.height * 0.94 + 22, { steps: 6 })
    await page.mouse.up()
    await cropBtn.click()
    await page.waitForTimeout(200)
    const after = await pngSize(page, await page.evaluate(() => (window as any).__lastCrop))
    assert.ok(after.w > base.w, `放大 ${base.w}→${after.w}`)
    assert.ok(Math.abs(after.w / after.h - 4 / 3) < 0.02, `等比 ${(after.w / after.h).toFixed(3)}`)
    await page.locator('main button').filter({ hasText: '重置' }).first().click()
    await cropBtn.click()
    await page.waitForTimeout(200)
    const reset = await pngSize(page, await page.evaluate(() => (window as any).__lastCrop))
    assert.equal(reset.w, base.w, '重置回位')
  } finally { await page.close() }
})
