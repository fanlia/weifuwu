/**
 * showcase 组件测试——Tag（/components/core/tag）
 *
 * 每组件一个测试文件（单独运行）：
 *   node --env-file=.env --test apps/showcase/test/comp-tag.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/core/tag'

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

test('渲染零错误 + 变体（默认/primary/success/danger + 可关闭）', async () => {
  const page = await browser.newPage()
  try {
    const errors = await openShowcase(page, BASE, COMP_PATH)
    assert.deepEqual(errors.filter((e) => !e.includes('Failed to load resource')), [], `零错误（实际: ${errors[0] ?? '无'}）`)
    const text = await page.evaluate(() => document.body.textContent ?? '')
    for (const t of ['默认标签', '主要标签', '完成', '错误', '可关闭标签']) {
      assert.ok(text.includes(t), `变体渲染：${t}`)
    }
  } finally {
    await page.close()
  }
})

test('demo 交互：关闭可关闭标签 → 消失', async () => {
  const page = await browser.newPage()
  try {
    await openShowcase(page, BASE, COMP_PATH)
    await page.waitForFunction(() => (document.body.textContent ?? '').includes('删除我'), '标签存在', { timeout: 3000 })
    // 关闭「删除我」（其 tag 的关闭按钮）
    const tag = page.locator('main .wf-surface .wf-tag', { hasText: '删除我' }).first()
    await tag.locator('button, [class*="close"]').click()
    await page.waitForFunction(() => !(document.body.textContent ?? '').includes('删除我'), '标签关闭', { timeout: 3000 })
  } finally {
    await page.close()
  }
})
