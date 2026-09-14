/**
 * showcase 组件测试——Backtop（/components/backtop）——全功能点固化
 * 清单：「Backtop」组（playwright 实测后固化）
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-backtop.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/backtop'

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

test('FP1 初始隐藏（scrollY=0 < 400 阈值）+ 滚动超阈值显示', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.evaluate(() => { document.body.style.minHeight = '2000px' })
    const state = () => page.evaluate(() => {
      const btn = document.querySelector('main .wf-backtop')
      if (!btn) return null
      const s = getComputedStyle(btn)
      return { hidden: btn.className.includes('--hidden'), pe: s.pointerEvents }
    })
    const s0 = await state()
    assert.ok(!s0 || s0.hidden, `初始隐藏（${JSON.stringify(s0)}）`)
    await page.evaluate(() => window.scrollTo(0, 500))
    await page.waitForFunction(() => !(document.querySelector('main .wf-backtop')?.className ?? '').includes('--hidden'), null, { timeout: 8000 })
    const s1 = await state()
    assert.equal(s1?.pe, 'auto', '显示后可点（pointer-events）')
  } finally { await page.close() }
})

test('FP2 点击回顶（smooth）+ 回顶后隐藏', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.evaluate(() => { document.body.style.minHeight = '2000px' })
    await page.evaluate(() => window.scrollTo(0, 800))
    await page.waitForFunction(() => !(document.querySelector('main .wf-backtop')?.className ?? '').includes('--hidden'), null, { timeout: 8000 })
    await page.locator('main .wf-backtop').click({ force: true })
    await page.waitForFunction(() => window.scrollY < 50, null, { timeout: 8000 })
    await page.waitForFunction(() => (document.querySelector('main .wf-backtop')?.className ?? '').includes('--hidden'), null, { timeout: 8000 })
  } finally { await page.close() }
})
