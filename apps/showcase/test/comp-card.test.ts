/**
 * showcase 组件测试——Card（/components/core/card）
 *
 * 每组件一个测试文件（单独运行）：
 *   node --env-file=.env --test apps/showcase/test/comp-card.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/core/card'

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

test('渲染零错误 + 内容断言', async () => {
  const page = await browser.newPage()
  try {
    const errors = await openShowcase(page, BASE, COMP_PATH)
    assert.deepEqual(errors.filter((e) => !e.includes('Failed to load resource')), [], `零错误（实际: ${errors[0] ?? '无'}）`)
    const text = await page.evaluate(() => document.body.textContent ?? '')
    for (const t of ['默认卡片', '线框卡片', '可点击卡片']) {
      assert.ok(text.includes(t), `内容渲染：${t}`)
    }
  } finally {
    await page.close()
  }
})
