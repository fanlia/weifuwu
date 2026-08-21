/**
 * showcase 组件测试——Typography（/components/core/typography）——完整功能
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-typography.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/core/typography'

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

test('渲染零错误 + 变体（Title 1/3 + Text 4 类型 + strong/code + Paragraph ellipsis）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    const text = await page.evaluate(() => document.body.textContent ?? '')
    for (const t of ['一级标题', '三级标题', '次要文字', '成功', '警告', '危险', '加粗', '下划线', '删除线']) {
      assert.ok(text.includes(t), `变体渲染：${t}`)
    }
    // Title 标签（h1/h3）
    const h1 = await page.evaluate(() => !!document.querySelector('main h1'))
    const h3 = await page.evaluate(() => !!document.querySelector('main h3'))
    assert.ok(h1 && h3, 'Title 语义标签（h1/h3）')
    // Paragraph ellipsis（单行截断——white-space nowrap + overflow hidden）
    const ell = await page.evaluate(() => {
      const p = Array.from(document.querySelectorAll('main p')).find((x) => x.textContent?.includes('很长'))
      return p ? getComputedStyle(p).textOverflow : 'n/a'
    })
    assert.equal(ell, 'ellipsis', 'Paragraph ellipsis 截断')
  } finally {
    await page.close()
  }
})
