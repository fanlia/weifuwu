/**
 * 场景 e2e——playwright 访问真实页面断言 DOM 行为
 *
 * 运行：node src/test/scenario/e2e.ts（自动起 server——端口 3299）
 * 断言纪律：真实 DOM（outerHTML/rect/portal 归属）——不用 textContent 掩盖结构。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser, type Page } from 'playwright'
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

// ── 场景 1：占位同构（§6.3 提交按钮消失事故回归） ──────────────────────
// children 含 false 占位——DOM 同构（childNodes 长度恒定）——
// diff 不误删兄弟（按钮保留）——空洞 → 真实元素切换（Alert 在按钮前）。
test('hole-placeholder：false 占位不误删兄弟——空洞切换位置正确', async () => {
  const page = await browser.newPage()
  try {
    await openScenario(page, BASE, 'hole-placeholder')

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
    await openScenario(page, BASE, 'component-reuse')

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
    await openScenario(page, BASE, 'keyed-reorder')

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
    await openScenario(page, BASE, 'portal-toggle')

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
    await openScenario(page, BASE, 'diff-update')

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
    await openScenario(page, BASE, 'events-rebind')

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
    await openScenario(page, BASE, 'fragment-expand')

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
    await openScenario(page, BASE, 'ref-lifecycle')

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
