/**
 * 场景 e2e 第三文件（场景 15-24——style/守卫/dispose/拖拽/滚动/chat/i18n/IO/输入）
 * 与 e2e/e2e-2 拆文件——node --test 多文件并发——总时长压进 R-01 预算。
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

// ── 场景 21：i18n 中间件（locale 切换 + t 插值） ───────────────────────
test('i18n-switch：setLocale + render → t() 读新 locale（插值正确）', async () => {
  const page = await browser.newPage()
  try {
    await openScenario(page, BASE, 'i18n-switch')

    assert.equal(await page.locator('.i18n-hello').textContent(), '你好', '初始 zh')
    assert.equal(await page.locator('.i18n-count').textContent(), '数量 42', '插值 {n} → 42')
    await page.click('.i18n-switch')
    await page.waitForFunction(() => document.querySelector('.i18n-hello')?.textContent === 'Hello')
    assert.equal(await page.locator('.i18n-count').textContent(), 'Count 42', 'en 插值')
  } finally {
    await page.close()
  }
})

// ── 场景 22：useInView（IntersectionObserver——滚动进出视口） ───────────
test('in-view：滚动进出视口 → isIn 变化（IO 事件驱动重渲染）', async () => {
  const page = await browser.newPage()
  try {
    await openScenario(page, BASE, 'in-view')

    // 初始：目标在视口外（spacer 600px 撑开——首帧 IO 报告不可见）
    await page.waitForFunction(() => document.querySelector('.inview-state')?.textContent === '不可见', '首帧 IO 报告不可见（spacer 撑出视口）', { timeout: 3000 })
    // 滚动到目标 → 可见
    await page.evaluate(() => document.querySelector('.inview-target')!.scrollIntoView())
    await page.waitForFunction(() => document.querySelector('.inview-state')?.textContent === '可见', '滚动进入视口 → isIn true（IO 回调驱动渲染）', { timeout: 3000 })
  } finally {
    await page.close()
  }
})

// ── 场景 23：useControlledInput（§5.3——内部态 + onChange 回流） ───────
test('controlled-input：输入走内部态（不重挂——焦点保持）+ onChange 回流', async () => {
  const page = await browser.newPage()
  try {
    await openScenario(page, BASE, 'controlled-input')

    // 输入（playwright 逐键——真实键盘序列）
    await page.click('.ctrl-input')
    await page.keyboard.type('abc')
    await page.waitForFunction(() => (document.querySelector('.ctrl-input') as HTMLInputElement)?.value === 'abc')
    assert.equal(await page.locator('.ctrl-onchange').textContent(), 'abc', 'onChange 回流（setValue → 受控）')
    // 焦点保持（输入期间组件未重挂——§5.3 焦点保持前提）
    assert.equal(await page.evaluate(() => document.activeElement === document.querySelector('.ctrl-input')), true, '焦点保持（内部态——无重挂）')
  } finally {
    await page.close()
  }
})

// ── 场景 24：useOpen 受控缺回调（§5.2——warn + 状态不变化） ────────────
test('open-guard：受控缺 onOpenChange → warn（静默不可用防护——§5.2）', async () => {
  const page = await browser.newPage()
  const warns: string[] = []
  page.on('console', (m) => { if (m.type() === 'warning') warns.push(m.text()) })
  try {
    await openScenario(page, BASE, 'open-guard')

    assert.equal(await page.locator('.open-state').textContent(), '关', '初始关')
    await page.click('.open-toggle')
    await page.waitForTimeout(200)
    assert.equal(await page.locator('.open-state').textContent(), '关', '受控缺回调——状态不变化（静默不可用被 warn 揭示）')
    const hasWarn = warns.some((w) => w.includes('onOpenChange'))
    assert.equal(hasWarn, true, `warn 提示（受控缺回调——§5.2 防护）——实际: ${warns.slice(0, 1).join(' | ') || '(无 warn)'}`)
  } finally {
    await page.close()
  }
})

// ── 场景 25：ws 中间件（WebSocket——欢迎 + echo 往返） ─────────────────
test('ws-echo：连接收欢迎消息 + 发送收 echo（真实 WebSocket 往返）', async () => {
  const page = await browser.newPage()
  try {
    await openScenario(page, BASE, 'ws-echo')

    // 欢迎消息（open 事件发送）
    await page.waitForFunction(() => document.querySelector('.ws-msg')?.textContent === '欢迎连接', '连接收到欢迎消息', { timeout: 4000 })
    // 发送 → echo 往返
    await page.click('.ws-send')
    await page.waitForFunction(() => {
      const msgs = Array.from(document.querySelectorAll('.ws-msg')).map((el) => el.textContent)
      return msgs.includes('echo:你好')
    }, 'echo 往返', { timeout: 4000 })
    const all = await page.evaluate(() => Array.from(document.querySelectorAll('.ws-msg')).map((el) => el.textContent))
    assert.deepEqual(all, ['欢迎连接', 'echo:你好'], '消息顺序（欢迎 → echo）')
  } finally {
    await page.close()
  }
})
