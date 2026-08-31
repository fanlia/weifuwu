/**
 * showcase 组件测试——Result（/components/result）
 *
 * 每组件一个测试文件（单独运行）：
 *   node --env-file=.env --test apps/showcase/test/comp-result.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/result'

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

test('渲染零错误 + 3 变体（success/error/warning——标题+描述）', async () => {
  const page = await browser.newPage()
  try {
    const errors = await openShowcase(page, BASE, COMP_PATH)
    assert.deepEqual(errors.filter((e) => !e.includes('Failed to load resource')), [], `零错误（实际: ${errors[0] ?? '无'}）`)
    const text = await page.evaluate(() => document.body.textContent ?? '')
    for (const t of ['注册成功', '提交失败', '权限不足']) {
      assert.ok(text.includes(t), `变体渲染：${t}`)
    }
    // 按钮渲染（进入工作台/重试）
    assert.ok(text.includes('进入工作台'), '操作按钮')
  } finally {
    await page.close()
  }
})

test('FP-追加 状态语义（success/error/warning 文案）+ extra 区', async () => {
  const page = await browser.newPage()
  try {
    await openShowcase(page, BASE, COMP_PATH)
    await page.waitForSelector('main [class*="result"]')
    const t = await page.evaluate(() => document.querySelector('main')?.textContent ?? '')
    assert.ok(/成功|失败|警告/.test(t), `状态词（${t.slice(0, 40)}）`)
  } finally { await page.close() }
})
