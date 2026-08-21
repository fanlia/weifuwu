/**
 * showcase 组件测试——Affix（/components/navigation/affix）——完整能力
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-affix.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/navigation/affix'

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

test('渲染零错误 + 滚动后固定（Affix offsetTop=0）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    // 滚动 300px（块滑出视口）→ content 固定（position fixed/sticky）
    await page.evaluate(() => window.scrollTo(0, 400))
    await page.waitForTimeout(400)
    const pos1 = await page.evaluate(() => {
      const el = document.querySelector('main .wf-affix-content')
      return el ? getComputedStyle(el).position : ''
    })
    assert.ok(pos1 === 'fixed' || pos1 === 'sticky', `滚动后固定（实际 ${pos1}）`)
  } finally { await page.close() }
})
