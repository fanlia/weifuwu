/**
 * showcase 组件测试——Scrollbar（/components/scrollbar）——完整功能
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-scrollbar.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/scrollbar'

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

test('渲染零错误 + 滚动容器（20 行——可滚动）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForFunction(() => (document.body.textContent ?? '').includes('滚动行 1'), '滚动行渲染', { timeout: 3000 })
    // 容器可滚动（scrollHeight > clientHeight）
    const sc = await page.evaluate(() => {
      const el = Array.from(document.querySelectorAll('main [class*="scroll"]')).find((x) => x.scrollHeight > x.clientHeight + 10)
      return el ? { sh: el.scrollHeight, ch: el.clientHeight } : null
    })
    assert.ok(sc, `滚动容器（scrollHeight ${sc?.sh} > clientHeight ${sc?.ch}）`)
    // 滚动后内容位置变化（滚到底部——行 20 可见）
    await page.evaluate(() => {
      const el = Array.from(document.querySelectorAll('main [class*="scroll"]')).find((x) => x.scrollHeight > x.clientHeight + 10)
      if (el) el.scrollTop = el.scrollHeight
    })
    await page.waitForTimeout(200)
    const bottomVisible = await page.evaluate(() => {
      const el = Array.from(document.querySelectorAll('main [class*="scroll"]')).find((x) => x.scrollHeight > x.clientHeight + 10)
      return el ? el.scrollTop > 0 : false
    })
    assert.ok(bottomVisible, '滚动生效')
  } finally {
    await page.close()
  }
})
