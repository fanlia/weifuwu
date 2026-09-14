/**
 * showcase 组件测试——RadioGroup（/components/radiogroup）——全功能点固化
 * 清单：「RadioGroup」组（playwright 实测后固化）
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-radiogroup.test.ts
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

async function open(page: import('playwright').Page): Promise<void> {
  const errors = await openShowcase(page, BASE, COMP_PATH)
  assert.deepEqual(errors.filter((e) => !e.includes('Failed to load resource')), [], `零错误（实际: ${errors[0] ?? '无'}）`)
  await page.waitForTimeout(300)
}

test('FP1 选项渲染 + 点击选中（sr-only input checked 回流）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main .wf-radio')
    assert.ok(await page.locator('main .wf-radio').count() >= 2, '选项渲染')
    await page.locator('main .wf-radio').nth(1).click()
    await page.waitForFunction(() => document.querySelectorAll('main input[type="radio"]')[1]?.checked, null, { timeout: 3000 })
  } finally { await page.close() }
})
