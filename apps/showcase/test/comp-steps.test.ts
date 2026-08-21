/**
 * showcase 组件测试——Steps（/components/navigation/steps）——完整能力
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-steps.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/navigation/steps'

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

test('渲染零错误 + 3 步（填写信息/支付/完成——初始第一步）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    const text = await page.evaluate(() => document.body.textContent ?? '')
    for (const t of ['填写信息', '支付', '完成']) assert.ok(text.includes(t), `步骤：${t}`)
    // aria-current 标识当前步（info）
    const cur = await page.evaluate(() => document.querySelector('main [aria-current="step"]')?.textContent ?? '')
    assert.ok(cur.includes('填写信息'), `aria-current 第一步（实际 ${cur.slice(0, 20)}）`)
  } finally { await page.close() }
})

test('能力：active 切换（点「第三步」→ 完成步 aria-current）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.locator('main .wf-surface button', { hasText: '第三步' }).first().click()
    await page.waitForFunction(() => document.querySelector('main [aria-current="step"]')?.textContent?.includes('完成') ?? false, '第三步激活', { timeout: 3000 })
  } finally { await page.close() }
})
