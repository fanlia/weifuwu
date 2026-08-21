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

test('demo 交互：价格区间（range）hover thumb 不卡死 + tooltip 值', async () => {
  const page = await browser.newPage()
  try {
    await openShowcase(page, BASE, COMP_PATH)
    // 价格区间（第 4 个 slider——range 双 thumb——300-1500）
    const inputs = page.locator('main input[type="range"]')
    const r = await inputs.nth(3).boundingBox()
    const THUMB_R = 9
    // lo thumb（300/2000 = 15%）
    await page.mouse.move(r.x + THUMB_R + 0.15 * (r.width - THUMB_R * 2), r.y + r.height / 2)
    await page.waitForTimeout(500)
    assert.equal(await page.evaluate(() => 'alive', { timeout: 3000 }), 'alive', 'lo thumb hover 不卡死')
    await page.waitForFunction(() => document.querySelector('#__wf_portal-slider-tooltip')?.textContent === '300', 'lo tooltip 300', { timeout: 3000 })
    // hi thumb（1500/2000 = 75%）
    await page.mouse.move(r.x + THUMB_R + 0.75 * (r.width - THUMB_R * 2), r.y + r.height / 2)
    await page.waitForTimeout(500)
    assert.equal(await page.evaluate(() => 'alive', { timeout: 3000 }), 'alive', 'hi thumb hover 不卡死')
    await page.waitForFunction(() => document.querySelector('#__wf_portal-slider-tooltip')?.textContent === '1500', 'hi tooltip 1500', { timeout: 3000 })
  } finally {
    await page.close()
  }
})

test('demo 交互：价格区间拖拽 thumb → 显示值实时更新（受控回流）', async () => {
  const page = await browser.newPage()
  try {
    await openShowcase(page, BASE, COMP_PATH)
    await page.waitForFunction(() => (document.body.textContent ?? '').includes('600 - 1500') || (document.body.textContent ?? '').includes('300 - 1500'), '初始区间', { timeout: 3000 })
    const inputs = page.locator('main input[type="range"]')
    const r = await inputs.nth(3).boundingBox()
    const THUMB_R = 9
    const y = r.y + r.height / 2
    // 拖 lo：15% → 30%（600）
    await page.mouse.move(r.x + THUMB_R + 0.15 * (r.width - THUMB_R * 2), y)
    await page.waitForTimeout(300)
    await page.mouse.down()
    await page.mouse.move(r.x + THUMB_R + 0.30 * (r.width - THUMB_R * 2), y, { steps: 5 })
    await page.waitForTimeout(200)
    await page.mouse.up()
    // 显示值实时更新（受控回流——thumb/显示/mark 一致）
    await page.waitForFunction(() => (document.body.textContent ?? '').includes('600 - 1500'), '显示 600 - 1500', { timeout: 3000 })
    // thumb 位置与显示一致（input 值 30 = 600）
    const v = await inputs.nth(3).inputValue()
    assert.equal(v, '30', `lo thumb 值（实际 ${v}——显示 600）`)
  } finally {
    await page.close()
  }
})

test('marks 与 thumb 对齐（一条线——dot 中心 = thumbOffset 公式）', async () => {
  const page = await browser.newPage()
  try {
    await openShowcase(page, BASE, COMP_PATH)
    // 价格 slider（第 3 个——marks 0/500/1000/1500/2000）——dot 中心与期望位置 ±1px
    const info = await page.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll('main input[type="range"]'))
      const price = inputs[2]
      const pr = price.getBoundingClientRect()
      const marks = price.parentElement?.querySelector('.wf-slider-marks')
      const dots = Array.from(marks?.querySelectorAll('.wf-slider-mark') ?? [])
      const THUMB_R = 9
      const expect = (t) => pr.left + THUMB_R + (pr.width - THUMB_R * 2) * t
      return dots.map((d, i) => {
        const dr = d.getBoundingClientRect()
        return Math.round(expect(i * 0.25) - (dr.left + dr.width / 2))
      })
    })
    assert.equal(info.length, 5, '5 个 mark')
    for (const d of info) {
      assert.ok(Math.abs(d) <= 1, `mark 与 thumbOffset 对齐（偏差 ${d}px）`)
    }
    // 价格区间 thumb 与 fill 对齐（lo/hi）
    const rg = await page.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll('main input[type="range"]'))
      const lo = inputs[3]
      const lr = lo.getBoundingClientRect()
      const fill = lo.parentElement?.querySelector('.wf-slider-range-fill')
      const fr = fill?.getBoundingClientRect()
      const THUMB_R = 9
      return {
        loV: Number(lo.value), hiV: Number(inputs[4].value),
        fillL: fr ? Math.round(fr.left) : null, fillR: fr ? Math.round(fr.right) : null,
        expectL: Math.round(lr.left + THUMB_R + (lr.width - THUMB_R * 2) * (Number(lo.value) / 100)),
        expectR: Math.round(lr.left + THUMB_R + (lr.width - THUMB_R * 2) * (Number(inputs[4].value) / 100)),
      }
    })
    assert.ok(Math.abs(rg.fillL - rg.expectL) <= 1 && Math.abs(rg.fillR - rg.expectR) <= 1, `fill 与 thumb 中心对齐（${rg.fillL}/${rg.fillR} vs ${rg.expectL}/${rg.expectR}）`)
  } finally {
    await page.close()
  }
})
