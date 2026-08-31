/**
 * showcase 组件测试——TagsInput（/components/tagsinput）
 *
 * 每组件一个测试文件（单独运行）：
 *   node --env-file=.env --test apps/showcase/test/comp-tagsinput.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/tagsinput'

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

test('渲染零错误 + 标签渲染（typescript/weifuwu）', async () => {
  const page = await browser.newPage()
  try {
    const errors = await openShowcase(page, BASE, COMP_PATH)
    assert.deepEqual(errors.filter((e) => !e.includes('Failed to load resource')), [], `零错误（实际: ${errors[0] ?? '无'}）`)
    const text = await page.evaluate(() => document.body.textContent ?? '')
    for (const t of ['typescript', 'weifuwu']) {
      assert.ok(text.includes(t), `标签渲染：${t}`)
    }
  } finally {
    await page.close()
  }
})

test('demo 交互：输入 + 回车添加标签 → 计数更新', async () => {
  const page = await browser.newPage()
  try {
    await openShowcase(page, BASE, COMP_PATH)
    await page.waitForFunction(() => (document.body.textContent ?? '').includes('当前 2 个标签'), '初始 2 个', { timeout: 3000 })
    const input = page.locator('main .wf-surface input[type="text"]').first()
    await input.click()
    await page.keyboard.type('测试标签')
    await page.keyboard.press('Enter')
    await page.waitForFunction(() => (document.body.textContent ?? '').includes('当前 3 个标签'), '3 个标签', { timeout: 3000 })
  } finally {
    await page.close()
  }
})

test('FP-追加 Backspace 删除末位标签（添加→删空）', async () => {
  const page = await browser.newPage()
  try {
    await openShowcase(page, BASE, COMP_PATH)
    await page.waitForSelector('main input')
    const input = page.locator('main input').first()
    await input.click()
    await page.keyboard.type('临时标签')
    await page.keyboard.press('Enter')
    await page.waitForFunction(() => (document.querySelector('main')?.textContent ?? '').includes('临时标签'), null, { timeout: 3000 })
    await input.press('Backspace')
    await page.waitForFunction(() => !(document.querySelector('main')?.textContent ?? '').includes('临时标签'), null, { timeout: 3000 })
  } finally { await page.close() }
})
