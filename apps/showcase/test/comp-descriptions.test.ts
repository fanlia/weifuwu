/**
 * showcase 组件测试——Descriptions（/components/display/descriptions）——完整能力
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-descriptions.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/display/descriptions'

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

test('能力：items 渲染（label/value 语义） + column 布局 + span 跨列', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    const demo = page.locator('main .wf-descriptions').first()
    // 6 项（含 span=2 的技能）渲染
    assert.equal(await demo.locator('.wf-descriptions-item').count(), 6, '6 项渲染')
    // label/value 语义（文本存在——精确匹配）
    const text = await demo.textContent()
    assert.ok(text?.includes('名称') && text?.includes('小码（开发助手）'), '名称/value')
    assert.ok(text?.includes('模型') && text?.includes('deepseek-chat'), '模型/value')
    // span=2 跨列（内容 >1 列时 gridColumn span 2）
    const spanItem = demo.locator('.wf-descriptions-item').filter({ hasText: '技能' })
    const style = await spanItem.getAttribute('style')
    assert.ok(style?.includes('span 2') || style?.includes('span:2'), `span 跨列（${style ?? '无 style'}）`)
  } finally { await page.close() }
})
