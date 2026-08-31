/**
 * showcase 组件测试——ActionSheet（/components/actionsheet）——全功能点固化
 * 清单：design/COMPONENT-VERIFICATION-CHECKLIST.md「ActionSheet」组（playwright 实测后固化）
 * 修复回归：roving focus（方向键移动 DOM 焦点——2027-XX 键盘导航半残修复）
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-actionsheet.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/actionsheet'

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
  await page.waitForFunction(() => (document.querySelector('main')?.textContent ?? '').includes('选择操作'))
}

/** 打开面板（点击触发按钮——面板经 openPopup 挂 portal——等入场动画几何就位） */
async function openPanel(page: import('playwright').Page): Promise<void> {
  await page.locator('main button', { hasText: '选择操作' }).first().click()
  await page.waitForSelector('.wf-actionsheet-panel', { timeout: 3000 })
  // enter 动画（translateY(100%) → 0）——等面板完全进入视口再交互
  await page.waitForFunction(() => {
    const p = document.querySelector('.wf-actionsheet-panel')
    return p && p.getBoundingClientRect().bottom <= window.innerHeight
  }, null, { timeout: 3000 })
}

test('FP1/FP2 渲染基线：open=false 无面板 → open=true 面板+overlay（portal）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    assert.equal(await page.locator('.wf-actionsheet-panel').count(), 0, '初始无面板')
    await openPanel(page)
    assert.equal(await page.locator('.wf-actionsheet-panel').count(), 1, '面板出现')
    assert.equal(await page.locator('.wf-actionsheet-overlay').count(), 1, 'overlay 出现')
  } finally { await page.close() }
})

test('FP3/FP4/FP5 items 面：label+icon 渲染 · danger 语义类 · disabled 属性', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await openPanel(page)
    const t = await page.locator('.wf-actionsheet-panel').textContent()
    for (const label of ['拍照', '从相册选择', '分享', '删除', '不可用操作']) assert.ok(t?.includes(label), `label：${label}`)
    assert.ok((await page.locator('.wf-actionsheet-panel .wf-actionsheet-icon').count()) >= 4, 'icon 渲染（IconName → Icon）')
    const dangerCls = await page.locator('.wf-actionsheet-item', { hasText: '删除' }).getAttribute('class')
    assert.ok((dangerCls ?? '').includes('wf-actionsheet-item--danger'), 'danger 语义类')
    assert.notEqual(await page.locator('.wf-actionsheet-item', { hasText: '不可用操作' }).getAttribute('disabled'), null, 'disabled 属性')
  } finally { await page.close() }
})

test('FP9/FP12 title + menu 语义：标题元素 + aria-label + role=menu/menuitem + aria-modal', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await openPanel(page)
    assert.equal(await page.locator('.wf-actionsheet-title').textContent(), '选择操作', 'title 元素')
    assert.equal(await page.locator('.wf-actionsheet').getAttribute('aria-label'), '选择操作', 'dialog aria-label')
    assert.equal(await page.locator('.wf-actionsheet').getAttribute('aria-modal'), 'true', 'aria-modal')
    assert.equal(await page.locator('.wf-actionsheet-panel').getAttribute('role'), 'menu', 'role=menu')
    assert.equal(await page.locator('.wf-actionsheet-item').first().getAttribute('role'), 'menuitem', 'role=menuitem')
  } finally { await page.close() }
})

test('FP10 roving focus（修复回归）：trapFocus 初始聚焦第一项 → ArrowDown 逐项移动', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await openPanel(page)
    const focusLabel = () => page.evaluate(() => (document.activeElement as HTMLElement | null)?.querySelector('.wf-actionsheet-item-label')?.textContent ?? '')
    assert.ok((await focusLabel()).includes('拍照'), 'trapFocus 初始聚焦第一项')
    await page.keyboard.press('ArrowDown')
    assert.ok((await focusLabel()).includes('从相册选择'), 'ArrowDown → 第二项')
    await page.keyboard.press('ArrowDown')
    assert.ok((await focusLabel()).includes('分享'), 'ArrowDown → 第三项')
  } finally { await page.close() }
})

test('FP6 Enter 选择 + 自动关闭：onSelect 回流（share）+ 面板移除', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await openPanel(page)
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Enter') // 焦点项「分享」——原生 click → onSelect('share') + onClose
    await page.waitForFunction(() => !(document.querySelector('main')?.textContent ?? '').includes('选择结果：未选择'), null, { timeout: 3000 })
    const t = await page.locator('main').textContent()
    assert.ok(t?.includes('share'), `onSelect 回流：${t?.match(/选择结果：(\S+)/)?.[1]}`)
    // presence 退场（exit 动画 → animationend → dispose）——等 DOM 移除
    await page.waitForFunction(() => document.querySelectorAll('.wf-actionsheet-panel').length === 0, null, { timeout: 3000 })
  } finally { await page.close() }
})

test('FP5b disabled 项不触发选择 + FP7b 取消按钮（cancelText 自定义）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await openPanel(page)
    // disabled 点击无效（面板保持——onSelect 不触发）
    await page.locator('.wf-actionsheet-item', { hasText: '不可用操作' }).click({ force: true }) // force：playwright 拒点 disabled
    await page.waitForTimeout(200)
    assert.equal(await page.locator('.wf-actionsheet-panel').count(), 1, 'disabled 点击后面板仍在')
    // 取消按钮（cancelText「算了」）→ onClose
    assert.equal(await page.locator('.wf-actionsheet-cancel').textContent(), '算了', '自定义 cancelText')
    await page.locator('.wf-actionsheet-cancel').click()
    await page.waitForTimeout(400)
    assert.equal(await page.locator('.wf-actionsheet-panel').count(), 0, '取消后关闭')
  } finally { await page.close() }
})

test('FP7a/FP7c/FP12b overlay 点击关闭 + Escape 关闭 + lockScroll', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await openPanel(page)
    assert.equal(await page.evaluate(() => document.body.style.overflow), 'hidden', 'lockScroll：body overflow hidden')
    // overlay 点击关闭（角落——避开面板）
    await page.locator('.wf-actionsheet-overlay').click({ position: { x: 10, y: 10 }, force: true })
    await page.waitForTimeout(400)
    assert.equal(await page.locator('.wf-actionsheet-panel').count(), 0, 'overlay 点击关闭')
    // Escape 关闭（document 级 GlobalKey）
    await openPanel(page)
    await page.keyboard.press('Escape')
    await page.waitForTimeout(400)
    assert.equal(await page.locator('.wf-actionsheet-panel').count(), 0, 'Escape 关闭')
  } finally { await page.close() }
})
