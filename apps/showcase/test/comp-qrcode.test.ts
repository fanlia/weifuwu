/**
 * showcase 组件测试——QRCode（/components/qrcode）——全功能点固化
 * 清单：「QRCode」组（playwright 实测后固化）
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-qrcode.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/qrcode'

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

test('FP1 SVG 二维码模块渲染', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main svg')
    const info = await page.evaluate(() => {
      const svg = document.querySelector('main svg')
      return { modules: svg.querySelectorAll('rect, path').length, w: Math.round(svg.getBoundingClientRect().width) }
    })
    assert.ok(info.modules > 20, `模块数 ${info.modules}`)
    assert.ok(info.w > 50, `尺寸 ${info.w}`)
  } finally { await page.close() }
})
