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

// ── 场景 15：style 只设不删（§6.4——display 残留事故回归） ─────────────
test('style-update：键消失 → 旧值清空（不残留——条件显隐正确）', async () => {
  const page = await browser.newPage()
  try {
    await openScenario(page, BASE, 'style-update')

    // 初始：空 style 属性（空对象——cssText 清空）
    assert.equal(await page.evaluate(() => document.querySelector('.style-box')?.getAttribute('style') ?? 'NONE'), '', '初始无 style 值')
    await page.click('.style-toggle')
    await page.waitForFunction(() => (document.querySelector('.style-box') as HTMLElement)?.getAttribute('style')?.includes('display: block'))
    await page.click('.style-toggle')
    await page.waitForFunction(() => (document.querySelector('.style-box') as HTMLElement)?.getAttribute('style') === '')
    assert.equal(await page.evaluate(() => (document.querySelector('.style-box') as HTMLElement)?.style.display ?? ''), '', 'display 清空（不残留 none/block——§6.4 回归）')
  } finally {
    await page.close()
  }
})

// ── 场景 16：事件非函数守卫（§6.4——diff 路径 warn + 跳过不中断） ───
test('event-guard：diff 更新为非函数 → warn + 跳过——渲染不中断', async () => {
  const page = await browser.newPage()
  const warns: string[] = []
  page.on('console', (m) => { if (m.type() === 'warning') warns.push(m.text()) })
  try {
    await openScenario(page, BASE, 'event-guard')

    assert.equal(await page.locator('.guard-ok').textContent(), '渲染正常', '初始渲染正常')
    // 初始函数事件可用
    await page.click('.bad-event-btn')
    await page.waitForFunction(() => (window as any).__evt === 1)
    // diff 更新为非函数 → warn + 跳过（不中断渲染管线）
    await page.click('.guard-switch')
    await page.waitForFunction(() => document.querySelector('.guard-ok')?.textContent === '渲染正常')
    assert.equal(await page.locator('.bad-event-btn').count(), 1, '渲染不中断（元素保留）')
    const hasWarn = warns.some((w) => w.includes('click') && w.includes('非函数'))
    assert.equal(hasWarn, true, `warn 提示（非函数事件守卫）——实际: ${warns.slice(0, 2).join(' | ') || '(无 warn)'}`)
  } finally {
    await page.close()
  }
})

// ── 场景 17：组件 dispose（卸载触发 onUnmount 清理钩子） ───────────────
test('dispose-hooks：每次卸载触发 onUnmount——重挂新实例再次注册', async () => {
  const page = await browser.newPage()
  try {
    await openScenario(page, BASE, 'dispose-hooks')

    assert.equal(await page.evaluate(() => (window as any).__cleaned ?? 0), 0, '初始未清理')
    await page.click('.dispose-toggle')
    await page.waitForFunction(() => (window as any).__cleaned === 1)
    assert.equal(await page.locator('.dispose-child').count(), 0, '子组件移除')
    // 重挂（新实例——再次注册 onUnmount）→ 再移除 → 再次清理
    await page.click('.dispose-toggle')
    await page.waitForFunction(() => document.querySelector('.dispose-child') !== null)
    await page.click('.dispose-toggle')
    await page.waitForFunction(() => (window as any).__cleaned === 2)
    assert.equal(await page.locator('.dispose-child').count(), 0, '重挂后卸载——新实例清理钩子触发')
  } finally {
    await page.close()
  }
})

// ── 场景 18：useDragDrop（HTML5 拖拽——数据传递 + 放置回调） ───────────
test('drag-drop：draggable enumerated + 数据传递 + drop 回调', async () => {
  const page = await browser.newPage()
  try {
    await openScenario(page, BASE, 'drag-drop')

    // draggable enumerated 显式 'true'（§6.2——空字符串解析 false 事故）
    assert.equal(await page.evaluate(() => document.querySelector('.drag-source')?.getAttribute('draggable')), 'true', 'draggable 显式 true（enumerated——非空串）')
    assert.equal(await page.evaluate(() => (document.querySelector('.drag-source') as HTMLElement).draggable), true, 'el.draggable 真值（§6.2 事故回归）')

    // HTML5 拖拽序列（dragstart → dragover → drop——原生 DataTransfer 往返）
    await page.evaluate(() => {
      const dt = new DataTransfer()
      const source = document.querySelector('.drag-source')!
      source.dispatchEvent(new DragEvent('dragstart', { dataTransfer: dt, bubbles: true }))
      const target = document.querySelector('.drag-target')!
      target.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true }))
      target.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true }))
    })
    await page.waitForFunction(() => document.querySelector('.drag-result')?.textContent === '{"id":"item-1"}')
    assert.equal(await page.locator('.drag-result').textContent(), '{"id":"item-1"}', 'drop 收到 dataTransfer 数据（JSON 往返）')
  } finally {
    await page.close()
  }
})

// ── 场景 19：useScrollPosition（容器滚动跟踪——事件驱动重渲染） ────────
test('scroll-position：容器 scrollTop 变化 → y 更新（滚动监听——非手动 render）', async () => {
  const page = await browser.newPage()
  try {
    await openScenario(page, BASE, 'scroll-position')

    assert.equal(await page.locator('.scroll-y').textContent(), 'y:0', '初始 y:0')
    await page.evaluate(() => {
      const wrap = document.querySelector('.scroll-wrap') as HTMLElement
      wrap.scrollTop = 500
      wrap.dispatchEvent(new Event('scroll'))
    })
    await page.waitForFunction(() => document.querySelector('.scroll-y')?.textContent === 'y:500', '滚动后 y:500（rAF 节流事件驱动）')
  } finally {
    await page.close()
  }
})

// ── 场景 20：useChat（AI 流式——NDJSON 分块累积——自动重渲染） ────────
test('use-chat：send → 流式分块累积（订阅自动重渲染——真实 HTTP）', async () => {
  const page = await browser.newPage()
  try {
    await openScenario(page, BASE, 'use-chat')

    await page.click('.chat-send')
    // 流式累积（分块 30ms——最终内容完整）
    await page.waitForFunction(() => document.querySelector('.msg-assistant')?.textContent === 'assistant:你好！', '流式累积完成（NDJSON 分块——订阅驱动重渲染）', { timeout: 5000 })
    // 用户消息也在
    assert.equal(await page.locator('.msg-user').textContent(), 'user:你好', '用户消息')
    // 状态回归 idle
    await page.waitForFunction(() => document.querySelector('.chat-status')?.textContent === 'idle', '流式结束 status: idle')
  } finally {
    await page.close()
  }
})
