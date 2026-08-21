/**
 * showcase 组件测试——Alert（/components/feedback/alert）
 *
 * 每组件一个测试文件（单独运行）：
 *   node --env-file=.env --test apps/showcase/test/comp-alert.test.ts
 *
 * 契约：4 变体渲染（info/success/warning/error）——closable 关闭。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/feedback/alert'

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

test('渲染零错误（组件页 + 文档）', async () => {
  const page = await browser.newPage()
  try {
    const errors = await openShowcase(page, BASE, COMP_PATH)
    assert.deepEqual(errors.filter((e) => !e.includes('Failed to load resource')), [], `零错误（实际: ${errors[0] ?? '无'}）`)
  } finally {
    await page.close()
  }
})

test('demo 交互：4 变体渲染 + closable 关闭（info/error 消失——success/warning 保留）', async () => {
  const page = await browser.newPage()
  try {
    await openShowcase(page, BASE, COMP_PATH)
    // 4 变体文字
    const text = await page.evaluate(() => document.body.textContent ?? '')
    for (const t of ['提示信息（可关闭）', '操作成功完成', '不可撤销', '发生了一个错误（可关闭）']) {
      assert.ok(text.includes(t), `变体渲染：${t}`)
    }
    // 关闭 info 和 error（closable）
    await page.locator('main .wf-alert .wf-alert-close, main .wf-surface .wf-alert button').first().click()
    await page.waitForFunction(() => !(document.body.textContent ?? '').includes('提示信息（可关闭）'), 'info 关闭', { timeout: 3000 })
    // success/warning 仍保留（非 closable）
    const after = await page.evaluate(() => document.body.textContent ?? '')
    assert.ok(after.includes('操作成功完成'), 'success 保留')
    assert.ok(after.includes('不可撤销'), 'warning 保留')
  } finally {
    await page.close()
  }
})
