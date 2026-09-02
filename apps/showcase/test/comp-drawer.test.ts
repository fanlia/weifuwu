/**
 * showcase 组件测试——Drawer（/components/drawer）——全功能点固化
 * 清单：「Drawer」组（playwright 实测后固化）
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-drawer.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/drawer'

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

test('FP1 右侧抽屉：panel 360px 贴右 + 标题 + footer', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main button')
    await page.locator('main button', { hasText: '右侧抽屉' }).first().click()
    await page.waitForSelector('.wf-drawer-panel', { timeout: 3000 })
    // 等滑入动画完成（panel right 进入视口内）
    await page.waitForFunction(() => {
      const p = [...document.querySelectorAll('.wf-drawer-panel')].find((x) => (x.textContent ?? '').includes('编辑用户'))
      return p && p.getBoundingClientRect().right <= innerWidth
    }, null, { timeout: 3000 })
    const g = await page.evaluate(() => {
      const panel = [...document.querySelectorAll('.wf-drawer-panel')].find((x) => (x.textContent ?? '').includes('编辑用户'))
      const r = panel.getBoundingClientRect()
      return { right: r.right, w: r.width, vw: innerWidth, t: panel.textContent ?? '' }
    })
    assert.ok(Math.abs(g.right - g.vw) < 2, `面板贴右（right=${g.right} vw=${g.vw}）`)
    assert.equal(g.w, 360, `默认宽 360px`)
    assert.ok(g.t.includes('编辑用户') && g.t.includes('保存'), '标题+footer')
    assert.ok(await page.locator('.wf-drawer-close').count() >= 1, 'close 按钮')
  } finally { await page.close() }
})

test('FP2 mask 遮罩点击关闭', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main button')
    await page.locator('main button', { hasText: '右侧抽屉' }).first().click()
    await page.waitForSelector('.wf-drawer-panel', { timeout: 3000 })
    await page.mouse.click(20, 300)
    await page.waitForFunction(() => !document.querySelector('.wf-drawer-panel'), null, { timeout: 3000 })
  } finally { await page.close() }
})

test('FP3 footer 取消按钮关闭', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main button')
    await page.locator('main button', { hasText: '右侧抽屉' }).first().click()
    await page.waitForSelector('.wf-drawer-panel', { timeout: 3000 })
    await page.locator('.wf-drawer button', { hasText: '取消' }).last().click()
    await page.waitForFunction(() => !document.querySelector('.wf-drawer-panel'), null, { timeout: 3000 })
  } finally { await page.close() }
})

test('FP4 左侧抽屉：panel 贴左（x=0）+ Escape 关闭', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main button')
    await page.locator('main button', { hasText: '左侧抽屉' }).first().click()
    await page.waitForFunction(() => {
      const p = [...document.querySelectorAll('.wf-drawer-panel')].find((x) => (x.textContent ?? '').includes('导航菜单'))
      return p && p.getBoundingClientRect().x >= -1
    }, null, { timeout: 3000 })
    const x = await page.evaluate(() => [...document.querySelectorAll('.wf-drawer-panel')].find((x) => (x.textContent ?? '').includes('导航菜单'))?.getBoundingClientRect().x)
    assert.ok(Math.abs(x) < 2, `贴左 x=${x}`)
    await page.keyboard.press('Escape')
    await page.waitForFunction(() => ![...document.querySelectorAll('.wf-drawer-panel')].some((x) => (x.textContent ?? '').includes('导航菜单')), null, { timeout: 3000 })
  } finally { await page.close() }
})
