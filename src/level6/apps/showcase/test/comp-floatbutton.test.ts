/**
 * showcase 组件测试——FloatButton（/components/floatbutton）——全功能点固化
 * 清单：「FloatButton」组（playwright 实测后固化）
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-floatbutton.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/floatbutton'

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

test('FP1 fixed 右下主按钮（position:fixed + 贴边）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main .wf-float-group', { timeout: 5000 })
    const pos = await page.evaluate(() => {
      const el = document.querySelector('main .wf-float-group')
      const r = el.getBoundingClientRect()
      return { x: r.x, bottom: r.bottom, vh: innerHeight, vw: innerWidth, fixed: getComputedStyle(el).position }
    })
    assert.equal(pos.fixed, 'fixed', 'fixed 定位')
    assert.ok(pos.bottom <= pos.vh + 2 && pos.x > pos.vw / 2, `右下角 ${JSON.stringify(pos)}`)
  } finally { await page.close() }
})

test('FP2/FP3 点击展开子项组 + 子项 onClick→toast', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main .wf-float-group-main')
    await page.locator('main .wf-float-group-main').first().click()
    await page.waitForSelector('main .wf-float-group--open', { timeout: 3000 })
    await page.locator('main .wf-float-group-item .wf-float-btn').first().click()
    await page.waitForFunction(() => (document.body.textContent ?? '').includes('编辑'), null, { timeout: 3000 })
  } finally { await page.close() }
})
