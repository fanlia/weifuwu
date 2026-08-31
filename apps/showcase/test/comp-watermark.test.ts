/**
 * showcase 组件测试——Watermark（/components/watermark）——水印覆盖
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-watermark.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/watermark'

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

test('能力：水印覆盖内容区', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    const text = await page.evaluate(() => document.body.textContent ?? '')
    assert.ok(text.includes('水印覆盖内容区'), '内容区')
    // 水印层（背景重复——伪元素/绝对层）
    const wm = await page.evaluate(() => {
      const t = document.querySelector('main')
      return t ? t.innerHTML.includes('weifuwu 内部资料') || !!t.querySelector('[class*="watermark"]') : false
    })
    assert.ok(wm, '水印层存在')
  } finally { await page.close() }
})
