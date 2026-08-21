/**
 * 场景 e2e 第二文件（场景 9-16——navigate/unmount/SSR 吸收/hooks/style/守卫）
 * 与 e2e.test.ts 拆文件——node --test 多文件并发——总时长压进 R-01 预算。
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

// ── 场景 9：navigate（链接拦截 → pushState + 整树替换） ─────────────────
test('navigate：同源链接点击 → pushState 导航 → 新场景整树替换', async () => {
  const page = await browser.newPage()
  try {
    await openScenario(page, BASE, 'navigate')

    assert.equal(await page.locator('.nav-link').count(), 1, '导航链接存在')
    await page.click('.nav-link')
    await page.waitForSelector('.reuse-scene')
    assert.equal(new URL(page.url()).pathname, '/scenario/component-reuse', 'URL 更新（pushState——无整页刷新）')
    assert.equal(await page.locator('.reuse-scene').count(), 1, '新场景渲染（root 整树替换）')
  } finally {
    await page.close()
  }
})

// ── 场景 10：unmount/dispose（handle.unmount——DOM/portal 完整清理） ────
test('unmount-dispose：卸载清空 DOM + portal 容器不残留', async () => {
  const page = await browser.newPage()
  try {
    await openScenario(page, BASE, 'unmount-dispose')

    // 先开弹层（portal 有内容）
    await page.click('.pop-btn')
    await page.waitForSelector('.um-portal')
    assert.equal(await page.evaluate(() => Boolean(document.querySelector('.um-portal')?.closest('#__wf_portal'))), true, '弹层在 portal')

    // 卸载 → root 清空 + portal 内容移除
    await page.click('.unmount-btn')
    await page.waitForFunction(() => !document.querySelector('.unmount-scene'))
    assert.equal(await page.evaluate(() => document.getElementById('root')?.childNodes.length ?? -1), 0, 'root 清空')
    assert.equal(await page.evaluate(() =>
      document.querySelector('#__wf_portal')?.querySelectorAll('*').length ?? 0), 0, 'portal 不残留（dispose 清理）')
  } finally {
    await page.close()
  }
})

// ── 场景 11：SSR 吸收（首帧结构对齐复用——焦点/状态保持） ──────────────
// SSR 输出静态 HTML 首屏 → 客户端 uiServe 接管——结构吸收：create 命令复用
// 已有 DOM（同一节点引用——输入焦点/输入值保持——无闪烁重建）。
test('ssr-adopt：首帧复用 SSR DOM（同一节点引用——输入焦点保持）', async () => {
  const page = await browser.newPage()
  try {
    await openScenario(page, BASE, 'ssr-adopt')

    // SSR 首屏内容存在（接管前静态 HTML）
    assert.equal(await page.locator('.ssr-bold').textContent(), '粗体', 'SSR 输出内容存在')

    // 输入框聚焦 + 输入值——接管后必须保持（同一节点引用——焦点/值不丢）
    await page.click('.ssr-input')
    await page.keyboard.type('你好')
    const inputRef = await page.evaluate(() => document.querySelector('.ssr-input'))
    const focused = await page.evaluate(() => document.activeElement === document.querySelector('.ssr-input'))
    assert.equal(focused, true, '接管后焦点保持（同一 input 节点）')
    assert.equal(await page.locator('.ssr-input').inputValue(), '你好', '输入值保持（未重建）')

    // 交互可用（吸收后事件接线）
    await page.click('.ssr-btn')
    await page.waitForFunction(() => document.querySelector('.ssr-btn')?.textContent === '点击 1')
    const inputRef2 = await page.evaluate(() => document.querySelector('.ssr-input'))
    assert.equal(inputRef2, inputRef, '重渲染后 input 仍为同一节点（吸收节点进影子树）')
  } finally {
    await page.close()
  }
})

// ── 场景 12：useExternal（共享状态——跨组件自动重渲染） ─────────────────
test('use-external：store 变化 → 订阅组件自动重渲染（无需手动 render）', async () => {
  const page = await browser.newPage()
  try {
    await openScenario(page, BASE, 'use-external')

    assert.equal(await page.locator('.ext-a').textContent(), 'A:0')
    assert.equal(await page.locator('.ext-b').textContent(), 'B:0')
    await page.click('.ext-inc')
    await page.waitForFunction(() => document.querySelector('.ext-a')?.textContent === 'A:1')
    assert.equal(await page.locator('.ext-b').textContent(), 'B:1', '两个订阅组件都自动更新（跨组件——store 驱动）')
    await page.click('.ext-inc')
    await page.waitForFunction(() => document.querySelector('.ext-a')?.textContent === 'A:2')
    assert.equal(await page.locator('.ext-b').textContent(), 'B:2')
  } finally {
    await page.close()
  }
})

// ── 场景 13：useMedia（媒体查询——视口变化自动重渲染） ─────────────────
test('use-media：视口变化 → 自动重渲染（事件驱动——非手动 render）', async () => {
  const page = await browser.newPage()
  try {
    await openScenario(page, BASE, 'use-media')

    assert.equal(await page.locator('.media-state').textContent(), '宽', '默认视口（宽于 700px）')
    await page.setViewportSize({ width: 500, height: 500 })
    await page.waitForFunction(() => document.querySelector('.media-state')?.textContent === '窄')
    await page.setViewportSize({ width: 1280, height: 720 })
    await page.waitForFunction(() => document.querySelector('.media-state')?.textContent === '宽', '恢复视口 → 自动切回')
  } finally {
    await page.close()
  }
})

// ── 场景 14：usePopup（弹层——portal + 定位 + 外部点击关闭） ──────────
test('use-popup：弹层 portal + 外部点击关闭（z-index 层叠纪律）', async () => {
  const page = await browser.newPage()
  try {
    await openScenario(page, BASE, 'use-popup')

    await page.click('.pop-trigger')
    await page.waitForSelector('.pop-panel')
    const inPortal = await page.evaluate(() => Boolean(document.querySelector('.pop-panel')?.closest('#__wf_portal')))
    assert.equal(inPortal, true, '弹层在 #__wf_portal（portal 纪律）')
    const style = await page.evaluate(() => (document.querySelector('.pop-panel') as HTMLElement)?.getAttribute('style') ?? '')
    assert.ok(style.includes('position: fixed'), 'fixed 定位（浮层纪律）')
    assert.ok(style.includes('top:') && style.includes('left:'), 'JS 坐标定位')
    // 锚点定位（el getter——按钮下方——非 0,0）
    const pos = await page.evaluate(() => {
      const btn = document.querySelector('.pop-trigger')!.getBoundingClientRect()
      const panel = document.querySelector('.pop-panel')!.getBoundingClientRect()
      return { panelTop: panel.top, btnBottom: btn.bottom }
    })
    assert.ok(pos.panelTop >= pos.btnBottom, '面板在按钮下方（bottom placement）')

    // 外部点击关闭（document mousedown——el/panel 外——远离面板）
    await page.mouse.click(400, 300)
    await page.waitForFunction(() => !document.querySelector('.pop-panel'))
    assert.equal(await page.locator('.pop-panel').count(), 0, '外部点击关闭')
  } finally {
    await page.close()
  }
})
