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
