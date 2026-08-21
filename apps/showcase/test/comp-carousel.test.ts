/**
 * showcase 组件测试——Carousel（/components/virtual/carousel）——完整能力
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-carousel.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/virtual/carousel'

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

test('能力：自动播放（autoplay 2.5s——dot 从 0 切到 1 + track transform）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    // 初始 dot 0 active
    const dot0 = await page.evaluate(() => {
      const d = document.querySelectorAll('.wf-carousel-dot')
      return d.length > 0 && d[0].className.includes('active')
    })
    assert.ok(dot0, '初始 dot 0 active')
    // 自动切换（2.5s interval——dot 1 active + track transform 变化）
    let ok = false
    for (let i = 0; i < 40; i++) {
      const r = await page.evaluate(() => {
        const d = document.querySelectorAll('.wf-carousel-dot')
        const t = document.querySelector<HTMLElement>('.wf-carousel-track')
        return { dot1: d.length > 1 && d[1].className.includes('active'), tf: t?.style.transform ?? '' }
      })
      if (r.dot1 || r.tf.includes('-100%')) { ok = true; break }
      await page.waitForTimeout(100)
    }
    assert.ok(ok, '自动切换（dot 1 / translateX(-100%)）')
  } finally { await page.close() }
})
