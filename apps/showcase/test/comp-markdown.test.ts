/**
 * showcase 组件测试——Markdown（/components/display/markdown）——完整能力
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-markdown.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/display/markdown'

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

test('能力：GFM 渲染（标题/粗体/删除线/任务列表/表格/代码/链接）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    const text = await page.evaluate(() => document.body.textContent ?? '')
    for (const t of ['项目进展', '核心模块', '任务进度', '参数对比', 'Markdown', '删除线', 'weifuwu 官网', 'const greet']) {
      assert.ok(text.includes(t), `GFM 渲染：${t}`)
    }
    // 结构断言（h1/表格/代码块/链接/任务列表）
    const h1 = await page.evaluate(() => !!document.querySelector('main h1'))
    const tbl = await page.evaluate(() => !!document.querySelector('main table'))
    const link = await page.evaluate(() => !!document.querySelector('main a[href="https://weifuwu.dev"]'))
    const code = await page.evaluate(() => !!document.querySelector('main pre code, main code'))
    assert.ok(h1 && tbl && link && code, `结构（h1=${h1} 表格=${tbl} 链接=${link} 代码=${code}）`)
  } finally { await page.close() }
})
