/**
 * 场景 e2e 第十七文件——Tour（新手引导组件深度）
 *
 * playwright 驱动（项目内置场景层——真实浏览器断言 DOM 行为）。
 * 锁定修复：
 * - usePopup positioning 'none' 时 panel 挂载不 refresh → position 回调
 *   从未执行 → rect 恒 0 → 气泡定位视口左上角（agent-browser 抓出）
 * - 完成/跳过关闭流程
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startScenarioServer, openScenario, type ScenarioServer } from './e2e-shared.ts'

let server: ScenarioServer
let BASE = ''
let browser: Browser

test.before(async () => {
  server = await startScenarioServer()
  BASE = server.base
  browser = await chromium.launch()
})

test.after(async () => {
  await browser?.close()
  server?.stop()
})

/** 打开 Tour 场景 + 点「开始引导」 */
async function openTour(page: import('playwright').Page): Promise<void> {
  await openScenario(page, BASE, 'deep-tour')
  await page.click('#tour-a')
  // 气泡出现（mask + bubble）
  await page.waitForSelector('.wf-tour-bubble', { timeout: 3000 })
}

test('deep-tour：打开 → 气泡定位到目标（rect 非 0——修复回归）', async () => {
  const page = await browser.newPage()
  try {
    await openTour(page)
    const pos = await page.evaluate(() => {
      const h = document.querySelector('.wf-tour-highlight') as HTMLElement
      const b = document.querySelector('.wf-tour-bubble') as HTMLElement
      const target = document.querySelector('#tour-a') as HTMLElement
      const tr = target.getBoundingClientRect()
      return {
        highlight: h ? { left: parseFloat(h.style.left), top: parseFloat(h.style.top), w: parseFloat(h.style.width), h: parseFloat(h.style.height) } : null,
        bubble: b ? { left: parseFloat(b.style.left), top: parseFloat(b.style.top) } : null,
        target: { left: tr.left, top: tr.top, w: tr.width, h: tr.height },
        bubbleVisible: b ? b.getBoundingClientRect().width > 0 : false,
      }
    })
    // 定位修复：highlight 与目标 rect 对齐（±1px）
    assert.ok(pos.highlight, 'highlight 渲染')
    assert.ok(Math.abs(pos.highlight.left - pos.target.left) < 1, `highlight.left 对齐目标（${pos.highlight.left} vs ${pos.target.left}）`)
    assert.ok(Math.abs(pos.highlight.top - pos.target.top) < 1, `highlight.top 对齐目标（${pos.highlight.top} vs ${pos.target.top}）`)
    assert.ok(pos.highlight.w > 0 && pos.highlight.h > 0, `highlight 尺寸非 0（${pos.highlight.w}x${pos.highlight.h}）`)
    // bubble 在目标下方（placement bottom——gap 10）
    assert.ok(pos.bubble && pos.bubble.top > pos.target.top + pos.target.h, `bubble 在目标下方（${pos.bubble.top} > ${pos.target.top + pos.target.h}）`)
    assert.ok(pos.bubbleVisible, 'bubble 可见（宽度 > 0）')
    assert.equal(await page.locator('.wf-tour-step').textContent(), '1 / 3', '步骤 1/3')
  } finally {
    await page.close()
  }
})

test('deep-tour：下一步 → 步骤推进 + 气泡跟随目标（placement right）', async () => {
  const page = await browser.newPage()
  try {
    await openTour(page)
    await page.click('.wf-tour-btn--primary')
    await page.waitForFunction(() => document.querySelector('.wf-tour-step')?.textContent === '2 / 3')
    const pos = await page.evaluate(() => {
      const b = document.querySelector('.wf-tour-bubble') as HTMLElement
      const target = document.querySelector('#tour-b') as HTMLElement
      const tr = target.getBoundingClientRect()
      return { bubbleLeft: b ? parseFloat(b.style.left) : NaN, targetRight: tr.left + tr.width }
    })
    // 第二步 placement right——bubble 在目标右侧（gap 10）
    assert.ok(pos.bubbleLeft > pos.targetRight, `bubble 在目标右侧（${pos.bubbleLeft} > ${pos.targetRight}）`)
    assert.equal(await page.locator('.wf-tour-step').textContent(), '2 / 3')
  } finally {
    await page.close()
  }
})

test('deep-tour：最后一步「完成」→ 回调 + 关闭（portal 清空）', async () => {
  const page = await browser.newPage()
  try {
    await openTour(page)
    // 两步下一步 → 3/3（最后一步——按钮变「完成」）
    await page.click('.wf-tour-btn--primary')
    await page.waitForFunction(() => document.querySelector('.wf-tour-step')?.textContent === '2 / 3')
    await page.click('.wf-tour-btn--primary')
    await page.waitForFunction(() => document.querySelector('.wf-tour-step')?.textContent === '3 / 3')
    const lastBtns = await page.evaluate(() => Array.from(document.querySelectorAll('.wf-tour-btn')).map((b) => b.textContent))
    assert.deepEqual(lastBtns, ['跳过', '上一步', '完成'], '最后一步按钮组')
    // 点完成 → onFinish → 关闭
    await page.click('.wf-tour-btn--primary')
    await page.waitForFunction(() => !document.querySelector('.wf-tour-bubble'), 'Tour 关闭', { timeout: 3000 })
    const portal = await page.evaluate(() => document.querySelector('#__wf_portal-tour')?.innerHTML ?? '')
    assert.ok(!portal.includes('wf-tour-bubble'), 'portal 内无残留气泡')
    // 可再次打开（状态复位）
    await page.click('#tour-a')
    await page.waitForSelector('.wf-tour-bubble', { timeout: 3000 })
    assert.equal(await page.locator('.wf-tour-step').textContent(), '1 / 3', '重新打开回到第一步')
  } finally {
    await page.close()
  }
})

test('deep-tour：跳过 → 关闭（onFinish 路径）', async () => {
  const page = await browser.newPage()
  try {
    await openTour(page)
    await page.click('.wf-tour-btn--ghost') // 跳过
    await page.waitForFunction(() => !document.querySelector('.wf-tour-bubble'), '跳过关闭', { timeout: 3000 })
    // 开始按钮可再次打开（demo 状态复位）
    await page.click('#tour-a')
    await page.waitForSelector('.wf-tour-bubble', { timeout: 3000 })
  } finally {
    await page.close()
  }
})
