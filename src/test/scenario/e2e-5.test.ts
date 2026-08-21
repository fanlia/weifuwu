/**
 * 场景 e2e 第五文件（场景 33-36——toast/useControlled/useBreakpoint/useTween）
 * 与 e2e/e2e-2/3/4 拆文件——node --test 多文件并发——总时长压进 R-01 预算。
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

// ── 场景 33：toast（命令式轻提示） ─────────────────────────────────────
test('toast-fire：命令式触发 → 显示 → 自动消失（独立容器 + dispose 清理）', async () => {
  const page = await browser.newPage()
  try {
    await openScenario(page, BASE, 'toast-fire')

    await page.click('.toast-fire')
    await page.waitForSelector('.wf-toast')
    assert.equal(await page.locator('.wf-toast-msg').textContent(), '操作成功', 'toast 消息')
    assert.equal(await page.evaluate(() => Boolean(document.querySelector('.wf-toast')?.closest('.wf-toast-host'))), true, '独立容器（body 下）')
    // 自动消失（duration 500ms）
    await page.waitForFunction(() => !document.querySelector('.wf-toast'), '自动消失 + dispose 清理', { timeout: 2500 })
    assert.equal(await page.evaluate(() => document.querySelectorAll('.wf-toast-host').length), 0, 'host 容器移除（不残留）')
  } finally {
    await page.close()
  }
})

// ── 场景 34：useControlled ─────────────────────────────────────────────
test('use-controlled：受控走回调（值不回流）+ 非受控内部态 + 缺省默认值', async () => {
  const page = await browser.newPage()
  try {
    await openScenario(page, BASE, 'use-controlled')

    assert.equal(await page.locator('.ctrl-val').textContent(), '父值', '受控初始（value 显式——父控制）')
    await page.click('.ctrl-set')
    await page.waitForFunction(() => document.querySelector('.ctrl-change')?.textContent === '新值')
    assert.equal(await page.locator('.ctrl-val').textContent(), '父值', '受控：setValue 只走 onChange——值不回流（父控制）')
    assert.equal(await page.locator('.unctrl-val').textContent(), '非受控默认', '非受控 defaultValue 生效')
    await page.click('.unctrl-set')
    await page.waitForFunction(() => document.querySelector('.unctrl-val')?.textContent === '内部')
    assert.equal(await page.locator('.unctrl-val').textContent(), '内部', '非受控内部态 + 自动渲染')
  } finally {
    await page.close()
  }
})

// ── 场景 35：useBreakpoint ─────────────────────────────────────────────
test('use-breakpoint：视口宽度 → 断点名（min-width 语义——最大匹配）', async () => {
  const page = await browser.newPage()
  try {
    await openScenario(page, BASE, 'use-breakpoint')

    // 默认 1280 → desktop（≥1024）
    await page.waitForFunction(() => document.querySelector('.bp-name')?.textContent === 'desktop', '默认视口 → desktop')
    await page.setViewportSize({ width: 800, height: 600 })
    await page.waitForFunction(() => document.querySelector('.bp-name')?.textContent === 'tablet', '800px → tablet（≥768）')
    await page.setViewportSize({ width: 400, height: 600 })
    await page.waitForFunction(() => document.querySelector('.bp-name')?.textContent === 'mobile', '400px → mobile（<768）')
  } finally {
    await page.close()
  }
})

// ── 场景 36：useTween ──────────────────────────────────────────────────
test('use-tween：目标变化 → 数值补间到目标（rAF 驱动——终点逼近）', async () => {
  const page = await browser.newPage()
  try {
    await openScenario(page, BASE, 'use-tween')

    assert.equal(await page.locator('.tween-val').textContent(), '0', '初始 0')
    await page.click('.tween-go')
    await page.waitForFunction(() => document.querySelector('.tween-val')?.textContent === '100', '补间到目标 100', { timeout: 2500 })
  } finally {
    await page.close()
  }
})

// ── 场景 37：confirm/notification 命令式（BUG#3 回归面） ───────────────
test('confirm-command：确认弹窗确定/取消 + 通知自动消失（命令式中间件）', async () => {
  const page = await browser.newPage()
  try {
    await openScenario(page, BASE, 'confirm-command')

    // confirm：弹出 → 确定 → resolve true
    await page.click('.cf-confirm')
    await page.waitForSelector('.wf-modal')
    await page.waitForFunction(() => document.querySelector('.wf-modal')?.textContent?.includes('确定删除'), '确认弹窗出现（命令式——vdom 引擎渲染）')
    // Button 不透传 class——footer 最后一个按钮（确定）
    await page.locator('.wf-modal-footer button').last().click()
    await page.waitForFunction(() => document.querySelector('.cf-result')?.textContent === 'true', 'confirm resolve(true)')
    assert.equal(await page.evaluate(() => document.querySelectorAll('.wf-modal').length), 0, '确认后弹窗移除（dispose 清理）')

    // notification：弹出 → 自动消失
    await page.click('.cf-notify')
    await page.waitForSelector('.wf-notification')
    assert.equal(await page.locator('.wf-notification').textContent(), '保存成功')
    await page.waitForFunction(() => !document.querySelector('.wf-notification'), '通知自动消失', { timeout: 2500 })
  } finally {
    await page.close()
  }
})

// ── 场景 38：useDrag（指针拖拽） ───────────────────────────────────────
test('use-drag：pointerdown → move 累积 → up 结束（活动期监听）', async () => {
  const page = await browser.newPage()
  try {
    await openScenario(page, BASE, 'use-drag')

    const box = await page.locator('.drag-hook-scene').boundingBox()
    assert.ok(box, '拖拽目标存在')
    await page.mouse.move(box.x + 10, box.y + 10)
    await page.mouse.down()
    await page.mouse.move(box.x + 40, box.y + 30, { steps: 3 })
    await page.mouse.move(box.x + 60, box.y + 50)
    await page.mouse.up()
    await page.waitForFunction(() => document.querySelector('.dh-ended')?.textContent === 'e:1', 'pointerup → onEnd')
    const m = await page.locator('.dh-moved').textContent()
    assert.ok((m ?? '').startsWith('m:'), `onMove 累积（实际 ${m}）`)
  } finally {
    await page.close()
  }
})

// ── 场景 39：useVisualViewport（视口尺寸） ─────────────────────────────
test('use-visual-viewport：width/height 与视口一致（vv 或 resize fallback）', async () => {
  const page = await browser.newPage()
  try {
    await openScenario(page, BASE, 'use-visual-viewport')

    await page.setViewportSize({ width: 800, height: 600 })
    await page.waitForFunction(() => document.querySelector('.vv-height')?.textContent === '600', 'height 跟随视口（vv 或 resize fallback）', { timeout: 2500 })
    assert.equal(await page.locator('.vv-offset').textContent(), '0', 'offsetTop 0（无键盘弹起）')
  } finally {
    await page.close()
  }
})
