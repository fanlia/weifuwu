/**
 * showcase 组件测试——RadioGroup（/components/radiogroup）
 *
 * 每组件一个测试文件（单独运行）：
 *   node --env-file=.env --test apps/showcase/test/comp-radiogroup.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/radiogroup'

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

test('渲染零错误 + 选项（性别 3 项 + 内联 2 项）', async () => {
  const page = await browser.newPage()
  try {
    const errors = await openShowcase(page, BASE, COMP_PATH)
    assert.deepEqual(errors.filter((e) => !e.includes('Failed to load resource')), [], `零错误（实际: ${errors[0] ?? '无'}）`)
    const text = await page.evaluate(() => document.body.textContent ?? '')
    for (const t of ['男', '女', '其他', '选项 A', '选项 B']) {
      assert.ok(text.includes(t), `选项渲染：${t}`)
    }
  } finally {
    await page.close()
  }
})

test('demo 交互：选「女」→ 状态文字更新', async () => {
  const page = await browser.newPage()
  try {
    await openShowcase(page, BASE, COMP_PATH)
    await page.waitForFunction(() => (document.body.textContent ?? '').includes('选择: male'), '初始 male', { timeout: 3000 })
    await page.locator('main .wf-surface label', { hasText: '女' }).first().click()
    await page.waitForFunction(() => (document.body.textContent ?? '').includes('选择: female'), '选择 female', { timeout: 3000 })
  } finally {
    await page.close()
  }
})
