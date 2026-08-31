/**
 * showcase 组件测试——Chart（/components/chart）——柱状/饼图
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-chart.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/chart'

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

test('能力：图表渲染（柱状 + 饼图）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    const text = await page.evaluate(() => document.body.textContent ?? '')
    for (const t of ['1月', '2月', '直接', '6月']) assert.ok(text.includes(t), `图表：${t}`)
    // canvas/svg 渲染
    const cv = await page.evaluate(() => document.querySelectorAll('main canvas, main svg').length)
    assert.ok(cv > 0, `canvas/svg（实际 ${cv}）`)
  } finally { await page.close() }
})

test('tooltip 位置：anchor 上方 gap=8 + 水平居中（无 transform 双重偏移）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    // 折线图首个命中圆（r=9 透明命中区）
    const dot = page.locator('.wf-chart svg > g circle[fill="transparent"]').first()
    await dot.scrollIntoViewIfNeeded()
    await dot.hover()
    await page.waitForSelector('.wf-chart-tooltip')
    // 等待 popup 内核定位完成（rAF 异步——top/left 落地非 0）
    await page.waitForFunction(() => {
      const t = document.querySelector('.wf-chart-tooltip') as HTMLElement | null
      return !!t && t.style.top !== '' && t.style.top !== '0px' && t.style.left !== '' && t.style.left !== '0px'
    })
    const r = await page.evaluate(() => {
      const tip = document.querySelector('.wf-chart-tooltip')!.getBoundingClientRect()
      const c = document.querySelector('.wf-chart svg > g circle[fill="transparent"]')!.getBoundingClientRect()
      return {
        tip: { t: tip.top, b: tip.bottom, l: tip.left, r: tip.right },
        dot: { t: c.top, b: c.bottom, l: c.left, r: c.right },
      }
    })
    // 回归：CSS 残留 transform: translate(-50%, -100%) 使 tooltip 双重偏移
    // （漂移一面板高 + 半宽——rect 与 style top/left 不符）
    assert.ok(r.tip.b <= r.dot.t - 8 + 1, `top 间隙 ≥ 8（tip 底 ${r.tip.b} vs 点顶 ${r.dot.t}）`)
    const tipCx = (r.tip.l + r.tip.r) / 2
    const dotCx = (r.dot.l + r.dot.r) / 2
    assert.ok(Math.abs(tipCx - dotCx) <= 2, `水平居中（tip 中心 ${tipCx} vs 点中心 ${dotCx}）`)
    // 移开鼠标——tooltip 关闭（无残留）
    await page.mouse.move(20, 20)
    await page.waitForFunction(() => !document.querySelector('.wf-chart-tooltip'))
  } finally { await page.close() }
})
