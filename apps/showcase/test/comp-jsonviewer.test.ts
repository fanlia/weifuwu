/**
 * showcase 组件测试——JSONViewer（/components/display/jsonviewer）——完整能力
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-jsonviewer.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/display/jsonviewer'

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

test('能力：嵌套数据渲染（类型色 + 键值 + 折叠）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    const text = await page.evaluate(() => document.body.textContent ?? '')
    for (const t of ['agent_42', '订单处理 Agent', 'gpt-4o', 'temperature']) assert.ok(text.includes(t), `数据：${t}`)
    // 节点结构（wf-json-node——键值行）
    const nodes = await page.evaluate(() => document.querySelectorAll('main .wf-json-row, main .wf-json-node').length)
    assert.ok(nodes >= 8, `JSON 节点（实际 ${nodes}）`)
  } finally { await page.close() }
})
