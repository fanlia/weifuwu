/**
 * showcase 组件测试——ListScaffold（/components/listscaffold）——全功能点固化
 * 清单：isEmpty 切换 → 空态/数据互斥（并存 bug 防线）· 工具栏常驻
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-list-scaffold.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/listscaffold'

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

test('FP1 首帧：空态（isEmpty=true）——空态可见·数据列表不并存', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main [class*="wf-empty"]')
    const info = await page.evaluate(() => ({
      empty: document.querySelectorAll('main [class*="wf-empty"], main [class*="empty"]').length,
      hasData: (document.querySelector('main')?.textContent ?? '').includes('交付物 A'),
    }))
    assert.ok(info.empty >= 1, '空态可见')
    assert.equal(info.hasData, false, '无数据（空态与列表不并存）')
  } finally { await page.close() }
})

test('FP2 切「显示数据」→ 列表渲染·空态消失（互斥防线）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main button')
    const btns = await page.$$('main button')
    for (const b of btns) {
      const t = await b.textContent()
      if ((t ?? '').includes('显示数据')) { await b.click(); break }
    }
    await page.waitForTimeout(150)
    const info = await page.evaluate(() => ({
      hasData: (document.querySelector('main')?.textContent ?? '').includes('交付物 A'),
      // 空态根类（排除 empty 子类误报——用标签数）
      emptyRoot: document.querySelectorAll('main [class="wf-empty"], main [class^="wf-empty "]').length,
    }))
    assert.equal(info.hasData, true, '数据显示')
    assert.equal(info.emptyRoot, 0, '空态消失（互斥）')
  } finally { await page.close() }
})

test('FP3 工具栏常驻（搜索/筛选区可用）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main')
    const t = await page.evaluate(() => (document.querySelector('main')?.textContent ?? '').includes('工具栏区'))
    assert.equal(t, true, 'toolbar 渲染')
  } finally { await page.close() }
})
