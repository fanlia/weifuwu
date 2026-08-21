/**
 * showcase 组件测试——SortableList（/components/viz/sortablelist）——拖拽排序
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-sortablelist.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/viz/sortablelist'

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

test('能力：列表渲染（keyed 身份——数据 id）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    const text = await page.evaluate(() => document.body.textContent ?? '')
    for (const t of ['设计任务', '开发任务', '测试任务', '发布任务']) assert.ok(text.includes(t), `项：${t}`)
  } finally { await page.close() }
})
