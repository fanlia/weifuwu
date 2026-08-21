/**
 * showcase 组件测试——Kanban（/components/viz/kanban）——看板列/卡
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-kanban.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/viz/kanban'

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

test('能力：看板列 + 卡片（待办/进行中/已完成）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    const text = await page.evaluate(() => document.body.textContent ?? '')
    for (const t of ['待办', '进行中', '已完成', '设计 API 契约', 'Tour 定位修复']) assert.ok(text.includes(t), `看板：${t}`)
  } finally { await page.close() }
})
