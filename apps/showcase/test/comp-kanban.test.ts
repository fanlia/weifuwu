/**
 * showcase 组件测试——Kanban（/components/kanban）——全功能点固化
 * 清单：「Kanban」组（playwright 实测后固化）
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-kanban.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/kanban'

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

test('FP1/FP2 三列看板 + HTML5 拖拽跨列 onMove 回流', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main .wf-kanban-card')
    assert.ok(await page.locator('main .wf-kanban-col').count() >= 3, '三列')
    const t = await page.evaluate(() => document.querySelector('main')?.textContent ?? '')
    assert.ok(t.includes('设计 API 契约') && t.includes('待办'), '卡片+列')
    const moved = await page.evaluate(() => {
      const card = [...document.querySelectorAll('main *')].filter((e) => e.draggable && (e.textContent ?? '').includes('设计 API 契约'))[0]
      const dropCol = [...document.querySelectorAll('main .wf-kanban-col')].find((e) => (e.textContent ?? '').includes('进行中'))
      if (!card || !dropCol) return false
      const dt = new DataTransfer()
      card.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }))
      dropCol.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer: dt }))
      card.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: dt }))
      return true
    })
    assert.equal(moved, true, '拖拽事件序列')
    await page.waitForFunction(() => {
      const cols = [...document.querySelectorAll('main .wf-kanban-col')]
      return cols.some((c) => (c.textContent ?? '').includes('进行中') && (c.textContent ?? '').includes('设计 API 契约'))
    }, null, { timeout: 3000 })
  } finally { await page.close() }
})
