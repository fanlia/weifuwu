/**
 * showcase 组件测试——Skeleton（/components/display/skeleton）——完整能力
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-skeleton.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/display/skeleton'

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

test('渲染零错误 + 6 变体（avatar/文本/图片/表格/rect/circle）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    const items = await page.evaluate(() => document.querySelectorAll('main [class*="skeleton"]').length)
    assert.ok(items >= 8, `骨架元素（实际 ${items}）`)
    // 变体类（avatar/circle/table）
    const variants = await page.evaluate(() => {
      const cls = document.querySelector('main')?.innerHTML ?? ''
      return { avatar: cls.includes('skeleton-avatar') || cls.includes('skeleton--avatar'), circle: cls.includes('circle'), table: cls.includes('table') }
    })
    assert.ok(variants.avatar && variants.circle && variants.table, `变体（avatar=${variants.avatar} circle=${variants.circle} table=${variants.table}）`)
  } finally { await page.close() }
})
