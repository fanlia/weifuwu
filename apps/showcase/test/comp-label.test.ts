/**
 * showcase 组件测试——Label（/components/label）——完整功能
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-label.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/label'

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
}

test('渲染零错误 + 2 形态（普通/required）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    const text = await page.evaluate(() => document.body.textContent ?? '')
    assert.ok(text.includes('用户名') && text.includes('必填项'), 'label 渲染')
    // required 星号（必填项*——文字标记）
    const req = await page.evaluate(() => {
      const l = Array.from(document.querySelectorAll('main label')).find((x) => x.textContent?.includes('必填项'))
      return l?.textContent ?? ''
    })
    assert.ok(req.includes('*'), `required 星号（实际 ${req}）`)
  } finally {
    await page.close()
  }
})
