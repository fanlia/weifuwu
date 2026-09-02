/**
 * showcase 组件测试——Divider（/components/divider）——全功能点固化
 * 清单：「Divider」组（playwright 实测后固化）
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-divider.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/divider'

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

test('FP1/FP2 水平 divider + children 文案 + vertical 双实例', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main [class*="divider"]')
    const info = await page.evaluate(() => {
      const ds = [...document.querySelectorAll('main [class*="divider"]')]
      return {
        count: ds.length,
        vertical: ds.filter((d) => (d.className || '').includes('vertical')).length,
        t: document.querySelector('main')?.textContent ?? '',
      }
    })
    assert.equal(info.vertical, 2, `vertical×2`)
    assert.ok(info.t.includes('或'), 'children 文案')
    assert.ok(info.count >= 3, `3 水平实例`)
  } finally { await page.close() }
})
