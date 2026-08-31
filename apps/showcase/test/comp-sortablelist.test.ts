/**
 * showcase 组件测试——SortableList（/components/sortablelist）——拖拽排序
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-sortablelist.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/sortablelist'

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

test('FP-追加 拖拽换位（第 1 项拖到第 2 位——顺序真实变化）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main [draggable]')
    const items = page.locator('main [draggable]')
    assert.ok((await items.count()) >= 2, '可拖项 >= 2')
    const order0 = await page.evaluate(() => [...document.querySelectorAll('main [draggable]')].map((i) => i.textContent?.trim().slice(0, 6)).join('|'))
    const src = await items.nth(0).boundingBox()
    const dst = await items.nth(1).boundingBox()
    await page.mouse.move(src.x + src.width / 2, src.y + src.height / 2)
    await page.mouse.down()
    await page.mouse.move(dst.x + dst.width / 2, dst.y + dst.height / 2, { steps: 8 })
    await page.mouse.up()
    await page.waitForFunction((o) => [...document.querySelectorAll('main [draggable]')].map((i) => i.textContent?.trim().slice(0, 6)).join('|') !== o, order0, { timeout: 3000 })
  } finally { await page.close() }
})
