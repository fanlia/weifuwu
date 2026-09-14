/**
 * showcase 组件测试——SegmentedControl（/components/segmentedcontrol）
 *
 * 每组件一个测试文件（单独运行）：
 *   node --env-file=.env --test apps/showcase/test/comp-segmentedcontrol.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/segmentedcontrol'

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

test('渲染零错误 + 选项（AI 生成/手动编写/模板）', async () => {
  const page = await browser.newPage()
  try {
    const errors = await openShowcase(page, BASE, COMP_PATH)
    assert.deepEqual(errors.filter((e) => !e.includes('Failed to load resource')), [], `零错误（实际: ${errors[0] ?? '无'}）`)
    const text = await page.evaluate(() => document.body.textContent ?? '')
    for (const t of ['AI 生成', '手动编写', '模板']) {
      assert.ok(text.includes(t), `选项渲染：${t}`)
    }
  } finally {
    await page.close()
  }
})

test('demo 交互：点击「手动编写」→ 当前模式更新', async () => {
  const page = await browser.newPage()
  try {
    await openShowcase(page, BASE, COMP_PATH)
    await page.waitForFunction(() => (document.body.textContent ?? '').includes('当前模式: ai'), '初始 ai', { timeout: 3000 })
    await page.locator('main .wf-surface button', { hasText: '手动编写' }).first().click()
    await page.waitForFunction(() => (document.body.textContent ?? '').includes('当前模式: manual'), 'manual', { timeout: 3000 })
  } finally {
    await page.close()
  }
})
