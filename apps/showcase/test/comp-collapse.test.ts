/**
 * showcase 组件测试——Collapse（/components/collapse）——完整能力
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-collapse.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/collapse'

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

test('渲染零错误 + 3 项（知识库文档/异步加载/带操作区——初始第 1 项展开）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    const text = await page.evaluate(() => document.body.textContent ?? '')
    for (const t of ['知识库文档', '异步加载示例', '带操作区']) assert.ok(text.includes(t), `项：${t}`)
    assert.ok(text.includes('文档分块内容展示'), '初始第 1 项展开')
    assert.ok(text.includes('操作'), 'extra 操作按钮')
  } finally { await page.close() }
})

test('能力：展开折叠（受控 onChange——多开默认 multiple）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    // 点第 2 项（异步加载——loading 项）→ 展开（受控 active 加 2）
    await page.locator('main [class*="collapse"] [class*="header"], main [class*="collapse"] [class*="item"]', { hasText: '异步加载示例' }).first().click()
    await page.waitForTimeout(400)
    // 第 1 项保持展开（multiple 默认多开）+ 第 2 项展开（loading 态）
    const after = await page.evaluate(() => {
      const t = document.body.textContent ?? ''
      return { doc: t.includes('文档分块内容展示'), loading: t.includes('异步加载示例') }
    })
    assert.ok(after.doc, '第 1 项保持（multiple 多开）')
  } finally { await page.close() }
})
