/**
 * showcase 组件测试——Modal（/components/modal）——全功能点固化
 * 清单：「Modal」组（playwright 实测后固化）
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-modal.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/modal'

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

test('FP1 打开 + 面板宽 420 + 标题 + footer + close 按钮', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main button')
    await page.locator('main button', { hasText: '打开弹窗' }).first().click()
    await page.waitForSelector('.wf-modal-content', { timeout: 3000 })
    const m = await page.evaluate(() => {
      const dlg = document.querySelector('.wf-modal-content')
      return { w: Math.round(dlg.getBoundingClientRect().width), t: dlg.textContent ?? '' }
    })
    assert.ok(Math.abs(m.w - 420) < 30, `宽 ${m.w}`)
    assert.ok(m.t.includes('确认操作') && m.t.includes('确定'), '标题+footer')
    assert.ok(await page.locator('.wf-modal-close').count() >= 1, 'close 按钮')
  } finally { await page.close() }
})

test('FP2 mask 点击关闭（默认 true）+ Escape', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main button')
    await page.locator('main button', { hasText: '打开弹窗' }).first().click()
    await page.waitForSelector('.wf-modal-content', { timeout: 3000 })
    await page.mouse.click(20, 300)
    await page.waitForFunction(() => !document.querySelector('.wf-modal-content'), null, { timeout: 3000 })
    await page.locator('main button', { hasText: '打开弹窗' }).first().click()
    await page.waitForSelector('.wf-modal-content', { timeout: 3000 })
    await page.keyboard.press('Escape')
    await page.waitForFunction(() => !document.querySelector('.wf-modal-content'), null, { timeout: 3000 })
  } finally { await page.close() }
})

test('FP3 width 自定义（600px）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main select')
    await page.locator('main select').first().selectOption('600px')
    await page.locator('main button', { hasText: '打开弹窗' }).first().click()
    await page.waitForSelector('.wf-modal-content', { timeout: 3000 })
    const w = await page.evaluate(() => Math.round(document.querySelector('.wf-modal-content').getBoundingClientRect().width))
    assert.ok(Math.abs(w - 600) < 30, `宽 ${w}`)
  } finally { await page.close() }
})
