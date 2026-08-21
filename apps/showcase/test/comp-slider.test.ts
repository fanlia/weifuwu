/**
 * showcase 组件测试——Slider（/components/input/slider）
 *
 * 每组件一个测试文件（单独运行）：
 *   node --env-file=.env --test apps/showcase/test/comp-slider.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/input/slider'

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

test('渲染零错误 + 4 变体（音量/亮度/价格 marks/价格区间）', async () => {
  const page = await browser.newPage()
  try {
    const errors = await openShowcase(page, BASE, COMP_PATH)
    assert.deepEqual(errors.filter((e) => !e.includes('Failed to load resource')), [], `零错误（实际: ${errors[0] ?? '无'}）`)
    const text = await page.evaluate(() => document.body.textContent ?? '')
    for (const t of ['音量', '亮度', '价格', '价格区间']) {
      assert.ok(text.includes(t), `变体渲染：${t}`)
    }
  } finally {
    await page.close()
  }
})

test('demo 交互：滑块值变化 → 受控回流（input 事件链）', async () => {
  const page = await browser.newPage()
  try {
    await openShowcase(page, BASE, COMP_PATH)
    // range 不支持 playwright fill——input 事件驱动（demo onChange 链路）
    await page.evaluate(() => {
      const i = document.querySelector('main input[type="range"]') as HTMLInputElement
      i.value = '80'
      i.dispatchEvent(new Event('input', { bubbles: true }))
    })
    // 受控回流（demo render 后 input 值保持 80）
    await page.waitForFunction(() => (document.querySelector('main input[type="range"]') as HTMLInputElement).value === '80', '值回流', { timeout: 3000 })
  } finally {
    await page.close()
  }
})

test('demo 交互：hover 显示 tooltip 不卡死（回归——renderFn refresh 循环）', async () => {
  const page = await browser.newPage()
  try {
    await openShowcase(page, BASE, COMP_PATH)
    const box = await page.locator('main input[type="range"]').first().boundingBox()
    assert.ok(box, 'slider 定位')
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.waitForTimeout(600)
    // 页面响应（evaluate 超时 = 卡死）
    const alive = await page.evaluate(() => 'alive', { timeout: 3000 })
    assert.equal(alive, 'alive', 'hover 后页面响应（无卡死）')
    // tooltip 显示
    const tip = await page.evaluate(() => !!document.querySelector('.wf-slider-tip'))
    assert.ok(tip, 'tooltip 显示')
    // 连续 hover 多个 slider 仍稳定
    for (let i = 0; i < 3; i++) {
      const b = await page.locator('main input[type="range"]').nth(i).boundingBox()
      await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2)
      await page.waitForTimeout(200)
    }
    assert.equal(await page.evaluate(() => 'ok', { timeout: 3000 }), 'ok', '连续 hover 稳定')
  } finally {
    await page.close()
  }
})
