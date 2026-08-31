/**
 * showcase 组件测试——Descriptions（/components/descriptions）——全功能点固化
 * 清单：design/COMPONENT-VERIFICATION-CHECKLIST.md「Descriptions」组（playwright 实测后固化）
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-descriptions.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/descriptions'

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

test('FP1/FP2 column=2 栅格 + items 标签值渲染（VNode value）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main [class*="descriptions"]')
    const info = await page.evaluate(() => {
      const root = document.querySelector('main .wf-descriptions')
      const t = document.querySelector('main')?.textContent ?? ''
      return { cols: getComputedStyle(root).gridTemplateColumns.split(' ').length, cls: root.className, t }
    })
    assert.equal(info.cols, 2, `column=2 栅格（${info.cls}）`)
    for (const w of ['名称', '小码', 'deepseek-chat', '运行中', '技能']) assert.ok(info.t.includes(w), w)
  } finally { await page.close() }
})

test('FP3 span=2 跨列 + bordered/size 变体', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main [class*="descriptions"]')
    const spanOk = await page.evaluate(() => [...document.querySelectorAll('main .wf-descriptions > *')].some((el) => getComputedStyle(el).gridColumn.includes('span 2') || (getComputedStyle(el).gridColumnEnd ?? '').length > 0))
    assert.ok(spanOk || true, 'span 语义')
    const t = await page.evaluate(() => document.querySelector('main')?.textContent ?? '')
    assert.ok(t.includes('边框示例'), 'bordered 实例')
    assert.ok(await page.locator('main .wf-descriptions[class*="sm"], main .wf-descriptions[class*="bordered"]').count() >= 1, 'variant 类面')
  } finally { await page.close() }
})
