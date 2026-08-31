/**
 * showcase 组件测试——Icon（/components/icon）——完整功能
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-icon.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/icon'

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

test('渲染零错误 + 图标集（25 个名称 + 随字号/currentColor）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    const text = await page.evaluate(() => document.body.textContent ?? '')
    for (const n of ['chevron-down', 'settings', 'search', 'trash', 'upload']) {
      assert.ok(text.includes(n), `图标名：${n}`)
    }
    const svgCount = await page.evaluate(() => document.querySelectorAll('main svg').length)
    assert.ok(svgCount >= 25, `SVG 图标数（实际 ${svgCount}）`)
    assert.ok(text.includes('随字号') && text.includes('currentColor'), '尺寸/颜色展示')
  } finally {
    await page.close()
  }
})
