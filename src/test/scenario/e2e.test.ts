/**
 * 场景 e2e——playwright 访问真实页面断言 DOM 行为
 *
 * 运行：node src/test/scenario/e2e.ts（自动起 server——端口 3299）
 * 断言纪律：真实 DOM（outerHTML/rect/portal 归属）——不用 textContent 掩盖结构。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser, type Page } from 'playwright'
import { spawn, type ChildProcess } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = resolve(fileURLToPath(new URL('.', import.meta.url)))

const PORT = 0 // 随机端口（自包含——避免端口残留/TIME_WAIT）——实际端口从 server stdout 解析
let BASE = ''

let server: ChildProcess
let browser: Browser

test.before(async () => {
  const serverPath = resolve(__dirname, 'server.ts')
  const repoRoot = resolve(__dirname, '..', '..', '..') // src/test/scenario → 仓库根
  server = spawn('node', [serverPath], {
    cwd: repoRoot, // 仓库根（server 内相对路径：./src/test/scenario/main.tsx）
    env: { ...process.env, SCENARIO_PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let logs = ''
  server.stdout?.on('data', (d) => { logs += String(d) })
  server.stderr?.on('data', (d) => { logs += String(d) })
  // 等待端口日志（确定性等待）
  for (let i = 0; i < 150; i++) {
    if (server.exitCode !== null) break
    const m = logs.match(/server on :(\d+)/)
    if (m) {
      BASE = `http://localhost:${m[1]}`
      break
    }
    await new Promise((r) => setTimeout(r, 100))
  }
  if (!BASE) throw new Error(`scenario server 启动失败:\n${logs}`)
  // 确认可响应
  for (let i = 0; i < 30; i++) {
    try { const r = await fetch(`${BASE}/`); if (r.ok) break } catch { /* not ready */ }
    await new Promise((r) => setTimeout(r, 100))
  }
  browser = await chromium.launch()
})

test.after(async () => {
  await browser?.close()
  server?.kill()
})

async function openScenario(page: Page, id: string): Promise<void> {
  page.on('pageerror', (e) => console.error('[pageerror]', String(e).slice(0, 300)))
  page.on('console', (m) => { if (m.type() === 'error') console.error('[console.error]', m.text().slice(0, 300)) })
  try {
    await page.goto(`${BASE}/scenario/${id}`, { waitUntil: 'networkidle' })
    // 首帧渲染完成（场景 root 有内容）
    await page.waitForSelector('#root > *')
  } catch (e) {
    console.error('[openScenario]', BASE, id, String(e).slice(0, 200))
    throw e
  }
}

// ── 场景 1：占位同构（§6.3 提交按钮消失事故回归） ──────────────────────
// children 含 false 占位——DOM 同构（childNodes 长度恒定）——
// diff 不误删兄弟（按钮保留）——空洞 → 真实元素切换（Alert 在按钮前）。
test('hole-placeholder：false 占位不误删兄弟——空洞切换位置正确', async () => {
  const page = await browser.newPage()
  try {
    await openScenario(page, 'hole-placeholder')

    // 首帧：字段 + 按钮存在（false 占位 = 注释节点——按钮不被误删）
    const before = await page.evaluate(() => document.querySelector('.hole-scene')!.childNodes.length)
    assert.equal(before, 3, '三个槽位（字段/占位/按钮）——childNodes 恒定')
    assert.equal(await page.locator('.submit-btn').count(), 1, '按钮保留（占位不塌缩）')

    // 点击 → false → 真实 Alert——出现在按钮前（位置正确）
    await page.click('.submit-btn')
    await page.waitForSelector('.alert-item')
    const html = await page.evaluate(() => document.querySelector('.hole-scene')!.innerHTML)
    assert.ok(html.indexOf('alert-item') < html.indexOf('submit-btn'), 'Alert 在按钮前（槽位 2 插入——不误删兄弟）')
    assert.equal(await page.locator('.submit-btn').count(), 1, '切换后按钮仍保留')
    assert.equal(await page.locator('.alert-item').textContent(), '错误提示')
  } finally {
    await page.close()
  }
})

// ── 场景 2：组件复用（工厂不重跑——内部 let 状态保持） ──────────────────
test('component-reuse：父重渲染不重挂子组件——内部状态保持', async () => {
  const page = await browser.newPage()
  try {
    await openScenario(page, 'component-reuse')

    // 子组件内部点击（count 1）——父重渲染（改标签）——count 不丢
    await page.click('.counter-btn')
    await page.waitForFunction(() => document.querySelector('.counter-btn')?.textContent === '计数 1')
    await page.click('.relabel-btn')
    await page.waitForFunction(() => document.querySelector('.relabel-btn')?.textContent?.startsWith('改标签 初始!'))
    assert.equal(await page.locator('.counter-btn').textContent(), '计数 1', '父重渲染后子组件状态保持（工厂不重跑）')
  } finally {
    await page.close()
  }
})

// ── 场景 3：keyed 身份跟随（重排状态不漂移） ───────────────────────────
test('keyed-reorder：重排后 key 身份跟随内容——状态不漂移', async () => {
  const page = await browser.newPage()
  try {
    await openScenario(page, 'keyed-reorder')

    // 勾选「甲」——重排（丙甲乙）——「甲」仍保持已选（key 身份跟随）
    const items = () => page.evaluate(() =>
      Array.from(document.querySelectorAll('.keyed-item')).map((el) => ({
        name: el.querySelector('.item-name')!.textContent,
        picked: el.querySelector('.pick-btn')!.textContent,
      })))
    assert.deepEqual(await items(), [
      { name: '甲', picked: '未选' }, { name: '乙', picked: '未选' }, { name: '丙', picked: '未选' },
    ])

    await page.locator('.keyed-item').nth(0).locator('.pick-btn').click()
    await page.waitForFunction(() => document.querySelectorAll('.keyed-item')[0]?.querySelector('.pick-btn')?.textContent === '已选')

    await page.click('.shuffle-btn')
    await page.waitForFunction(() => document.querySelectorAll('.keyed-item')[0]?.querySelector('.item-name')?.textContent === '丙')
    assert.deepEqual(await items(), [
      { name: '丙', picked: '未选' }, { name: '甲', picked: '已选' }, { name: '乙', picked: '未选' },
    ], '重排后「甲」的已选状态跟随 key（不漂移到新位置）')
  } finally {
    await page.close()
  }
})

// ── 场景 4：portal 往返（弹层增删——#__wf_portal 不残留） ──────────────
test('portal-toggle：打开进 #__wf_portal——关闭完整移除', async () => {
  const page = await browser.newPage()
  try {
    await openScenario(page, 'portal-toggle')

    assert.equal(await page.locator('.portal-content').count(), 0, '初始无弹层')
    await page.click('.portal-btn')
    await page.waitForSelector('.portal-content')
    assert.equal(await page.locator('.portal-content').count(), 1, '打开后弹层出现')
    const inPortal = await page.evaluate(() =>
      Boolean(document.querySelector('.portal-content')?.closest('#__wf_portal')))
    assert.equal(inPortal, true, '弹层在 #__wf_portal（portal 纪律）')

    await page.click('.portal-btn')
    await page.waitForFunction(() => !document.querySelector('.portal-content'))
    assert.equal(await page.locator('.portal-content').count(), 0, '关闭后弹层移除（不残留）')
  } finally {
    await page.close()
  }
})

// ── 场景 5：diff 就地更新（节点不重建——焦点保持前提） ──────────────────
test('diff-update：属性/文本就地更新——同一节点引用（不重建）', async () => {
  const page = await browser.newPage()
  try {
    await openScenario(page, 'diff-update')

    // 捕获节点引用——点击后必须仍为同一节点（不重建——焦点保持前提）
    const before = await page.evaluate(() => document.querySelector('.diff-scene'))
    await page.click('.update-btn')
    await page.waitForFunction(() => document.querySelector('.label')?.textContent === 'v2')
    const after = await page.evaluate(() => document.querySelector('.diff-scene'))
    assert.equal(after, before, '同一 div 节点——就地 patch 不重建')
    assert.equal(await page.locator('.diff-scene').getAttribute('data-label'), 'v2', '属性就地更新')
    assert.equal(await page.locator('.label').textContent(), 'v2', '文本就地更新（setText）')
  } finally {
    await page.close()
  }
})

// ── 场景 6：事件重绑（handler 引用变化——旧解绑新绑） ───────────────────
test('events-rebind：props 变化后新 handler 生效（引用比较重绑）', async () => {
  const page = await browser.newPage()
  try {
    await openScenario(page, 'events-rebind')

    await page.click('.ev-btn')
    await page.waitForFunction(() => document.querySelector('.ev-last')?.textContent === 'v0')
    await page.click('.swap-btn')
    await page.waitForFunction(() => document.querySelector('.swap-btn')?.textContent === '换 handler')
    await page.click('.ev-btn')
    await page.waitForFunction(() => document.querySelector('.ev-last')?.textContent === 'v1')
    assert.equal(await page.locator('.ev-last').textContent(), 'v1', '新 handler 生效（引用变化重绑——旧解绑）')
  } finally {
    await page.close()
  }
})

// ── 场景 7：Fragment/数组展开（DOM 平铺无中间层） ───────────────────────
test('fragment-expand：数组项 = 隐式 Fragment——直接子节点平铺', async () => {
  const page = await browser.newPage()
  try {
    await openScenario(page, 'fragment-expand')

    const kids = await page.evaluate(() =>
      Array.from(document.querySelector('.frag-scene')!.childNodes).map((n) =>
        (n as HTMLElement).tagName ?? n.nodeName))
    assert.deepEqual(kids, ['I', 'I', 'B'], '三个直接子节点（i1/i2/b1）——无中间 Fragment 层')
  } finally {
    await page.close()
  }
})

// ── 场景 8：ref 生命周期（挂载/卸载清理） ───────────────────────────────
test('ref-lifecycle：卸载触发 ref(null) 清理——重挂再次挂载', async () => {
  const page = await browser.newPage()
  try {
    await openScenario(page, 'ref-lifecycle')

    // render-only 快照语义：ref 在 apply 阶段调用——renderFn 读上一拍值
    // 首帧显示 m:0（渲染时 ref 未跑——apply 后 mounted=1 闭包内）
    assert.equal(await page.locator('.ref-stats').textContent(), 'm:0 c:0', '首帧快照（ref apply 后更新）')
    await page.click('.toggle-btn')
    await page.waitForFunction(() => document.querySelector('.ref-stats')?.textContent === 'm:1 c:0')
    assert.equal(await page.locator('.ref-box').count(), 0, '卸载——盒子移除（ref(null) 清理已跑——cleaned=1）')
    await page.click('.toggle-btn')
    await page.waitForFunction(() => document.querySelector('.ref-stats')?.textContent === 'm:1 c:1')
    assert.equal(await page.locator('.ref-box').count(), 1, '重挂——再次挂载（ref(el) 再次调用）')
  } finally {
    await page.close()
  }
})

// ── 场景 9：navigate（链接拦截 → pushState + 整树替换） ─────────────────
test('navigate：同源链接点击 → pushState 导航 → 新场景整树替换', async () => {
  const page = await browser.newPage()
  try {
    await openScenario(page, 'navigate')

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
    await openScenario(page, 'unmount-dispose')

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
    await openScenario(page, 'ssr-adopt')

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
    await openScenario(page, 'use-external')

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
    await openScenario(page, 'use-media')

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
    await openScenario(page, 'use-popup')

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
