/**
 * showcase 组件测试——InView（/components/inview）——完整能力
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-inview.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/inview'

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

test('能力：InView 进入视口 → onEnter（懒加载内容 + 事件日志）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    // onEnter 触发（demo 区域可能在首屏视口内——IO 进入即触发——内容出现）
    // 若不在首屏：滚动进入（IO 触发）
    await page.evaluate(() => {
      const el = Array.from(document.querySelectorAll('main div')).find((x) => x.textContent?.includes('懒加载内容已加载'))
      el?.scrollIntoView()
    })
    // evaluate 轮询（TD 样式循环规避）
    let ok = false
    for (let i = 0; i < 40; i++) {
      if (await page.evaluate(() => (document.body.textContent ?? '').includes('事件: 已加载'))) { ok = true; break }
      await page.waitForTimeout(100)
    }
    assert.ok(ok, 'onEnter 触发（事件: 已加载）')
    assert.ok(await page.evaluate(() => (document.body.textContent ?? '').includes('懒加载内容已加载')), '懒加载内容')
  } finally { await page.close() }
})
