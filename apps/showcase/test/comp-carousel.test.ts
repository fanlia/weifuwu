/**
 * showcase 组件测试——Carousel（/components/carousel）——全功能点固化
 * 清单：「Carousel」组（playwright 实测后固化）
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-carousel.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/carousel'

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

test('FP1 autoplay：2.9s 窗口内 dot 自动前进', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main .wf-carousel')
    const activeIdx = () => page.evaluate(() => [...document.querySelectorAll('main .wf-carousel-dot')].findIndex((d) => d.className.includes('active')))
    const i0 = await activeIdx()
    await page.waitForTimeout(2900)
    const i1 = await activeIdx()
    assert.notEqual(i0, i1, `dot ${i0} → ${i1}`)
  } finally { await page.close() }
})

test('FP2 arrows 切换 + loop 尾→头（默认 loop=true）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main .wf-carousel')
    const next = page.locator('main .wf-carousel').nth(1).locator('.wf-carousel-arrow--next')
    await next.click()
    await next.click()
    await page.waitForFunction(() => [...[...document.querySelectorAll('main .wf-carousel')][1].querySelectorAll('.wf-carousel-dot')].findIndex((d) => d.className.includes('active')) === 2, null, { timeout: 3000 })
    await next.click()
    await page.waitForFunction(() => [...[...document.querySelectorAll('main .wf-carousel')][1].querySelectorAll('.wf-carousel-dot')].findIndex((d) => d.className.includes('active')) === 0, null, { timeout: 3000 })
  } finally { await page.close() }
})

test('FP3 showDots：点 dot 跳转对应卡', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main .wf-carousel')
    await page.locator('main .wf-carousel').nth(1).locator('.wf-carousel-dot').nth(1).click()
    await page.waitForFunction(() => [...[...document.querySelectorAll('main .wf-carousel')][1].querySelectorAll('.wf-carousel-dot')].findIndex((d) => d.className.includes('active')) === 1, null, { timeout: 3000 })
  } finally { await page.close() }
})

test('FP4 内容渲染：两实例 6 卡齐全', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    const t = await page.evaluate(() => document.querySelector('main')?.textContent ?? '')
    assert.ok(t.includes('第一张') && t.includes('第六张'), '6 卡文本')
  } finally { await page.close() }
})
