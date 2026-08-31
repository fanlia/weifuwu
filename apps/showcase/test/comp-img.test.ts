/**
 * showcase 组件测试——Img（/components/img）——全功能点固化
 * 清单：design/COMPONENT-VERIFICATION-CHECKLIST.md「Img」组（playwright 实测后固化）
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-img.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/img'

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

test('FP1/FP2 图片渲染 + fallback 替换（broken → data SVG）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main img')
    const imgs = await page.evaluate(() => [...document.querySelectorAll('main img')].map((i) => ({ w: i.getBoundingClientRect().width, src: i.src.slice(0, 20) })))
    assert.ok(imgs.filter((i) => i.w === 120).length >= 4, `4 实例 120px`)
    const fallback = await page.evaluate(() => [...document.querySelectorAll('main img')].some((i) => (i.currentSrc || i.src).startsWith('data:image')))
    assert.equal(fallback, true, 'fallback 替换')
  } finally { await page.close() }
})

test('FP3 preview：点击放大（600×400）+ Escape 关闭', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main img[alt*="preview"]')
    await page.locator('main img[alt*="preview"]').first().click()
    await page.waitForFunction(() => {
      const i = document.querySelector('.wf-img-preview-image')
      return i && i.complete && i.naturalWidth > 0
    }, null, { timeout: 5000 })
    const w = await page.evaluate(() => Math.round(document.querySelector('.wf-img-preview-image').getBoundingClientRect().width))
    assert.equal(w, 600, `放大至原图 ${w}px`)
    await page.keyboard.press('Escape')
    await page.waitForFunction(() => !document.querySelector('.wf-img-preview-image'), null, { timeout: 3000 })
  } finally { await page.close() }
})
