/**
 * showcase 组件测试——Link（/components/core/link）——完整功能
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-link.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/core/link'

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

test('渲染零错误 + 5 变体（默认/主色/危险/无下划线/禁用）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    const text = await page.evaluate(() => document.body.textContent ?? '')
    for (const t of ['默认链接', '主色链接', '危险链接', '无下划线', '禁用链接']) {
      assert.ok(text.includes(t), `变体渲染：${t}`)
    }
    // 禁用链接不可点击（pointer-events none 或 disabled）
    const dis = await page.evaluate(() => {
      const a = Array.from(document.querySelectorAll('main a')).find((x) => x.textContent?.includes('禁用'))
      return a ? getComputedStyle(a).pointerEvents : 'n/a'
    })
    assert.equal(dis, 'none', '禁用链接 pointer-events none')
  } finally {
    await page.close()
  }
})
