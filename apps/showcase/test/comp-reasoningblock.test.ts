/**
 * showcase 组件测试——ReasoningBlock（/components/reasoningblock）——完整能力
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-reasoningblock.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/reasoningblock'

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

test('能力：推理折叠展示 + 模拟流式切换', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    const text = await page.evaluate(() => document.body.textContent ?? '')
    assert.ok(text.includes('已思考') && text.includes('先分析用户意图'), '推理内容')
    // 流式切换（点「模拟流式」→ streaming 态）
    await page.locator('main .wf-surface button', { hasText: '模拟流式' }).first().click()
    await page.waitForTimeout(300)
    assert.ok(await page.evaluate(() => (document.body.textContent ?? '').includes('停止模拟流式')), '流式态切换')
    // 停止
    await page.locator('main .wf-surface button', { hasText: '停止模拟流式' }).first().click()
    await page.waitForTimeout(300)
  } finally { await page.close() }
})
