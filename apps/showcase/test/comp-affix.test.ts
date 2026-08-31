/**
 * showcase 组件测试——Affix（/components/affix）——全功能点固化
 * 清单：design/COMPONENT-VERIFICATION-CHECKLIST.md「Affix」组（playwright 实测后固化）
 * 修复回归：
 * - style 对象→undefined 整体移除（applyStyle 静默 no-op → 卡 fixed——核心层）
 * - useScrollPosition refresh = ensure + emit（目标后挂载绑定丢失——核心层）
 * - threshold 容器级坐标系（rect.top+scrollTop 混入容器视口偏移——组件层）
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-affix.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/affix'

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
  await page.waitForSelector('main .wf-affix')
  await page.waitForTimeout(400) // 阈值微任务重算
}

test('FP1/FP2 渲染基线 + 初始非固定：affix/sentinel/content 三层 + static', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    const affix = page.locator('main .wf-affix').first()
    assert.equal(await affix.count(), 1, 'affix 根')
    assert.equal(await affix.locator('.wf-affix-sentinel').count(), 1, 'sentinel')
    assert.equal(await affix.locator('.wf-affix-content').count(), 1, 'content')
    const pos = await affix.locator('.wf-affix-content').evaluate((el) => getComputedStyle(el).position)
    assert.notEqual(pos, 'fixed', `初始未固定（${pos}）`)
  } finally { await page.close() }
})

test('FP3/FP4/FP5 页面级滚动固定：fixed + --active + top=0 + 宽度保持', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    const content = page.locator('main .wf-affix').first().locator('.wf-affix-content')
    const sentinel = page.locator('main .wf-affix').first().locator('.wf-affix-sentinel')
    const wBefore = await content.evaluate((el) => el.getBoundingClientRect().width)
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
    await page.waitForFunction(() => getComputedStyle(document.querySelector('main .wf-affix-content')!).position === 'fixed', null, { timeout: 3000 })
    assert.ok(((await sentinel.getAttribute('class')) ?? '').includes('--active'), 'sentinel --active')
    assert.equal(await content.evaluate((el) => getComputedStyle(el).top), '0px', 'top=offsetTop(0)')
    const wAfter = await content.evaluate((el) => el.getBoundingClientRect().width)
    assert.ok(Math.abs(wAfter - wBefore) < 2, `宽度保持（${Math.round(wBefore)} → ${Math.round(wAfter)}）`)
  } finally { await page.close() }
})

test('FP6 回滚还原（style 对象→undefined 移除回归）：滚回顶部 → static', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    const content = page.locator('main .wf-affix').first().locator('.wf-affix-content')
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
    await page.waitForFunction(() => getComputedStyle(document.querySelector('main .wf-affix-content')!).position === 'fixed', null, { timeout: 3000 })
    await page.evaluate(() => window.scrollTo(0, 0))
    // **卡 fixed 回归**：inline style 残留则永远 fixed——必须还原
    await page.waitForFunction(() => getComputedStyle(document.querySelector('main .wf-affix-content')!).position !== 'fixed', null, { timeout: 3000 })
  } finally { await page.close() }
})

test('FP7 容器级 target（修复回归）：容器滚动 → 容器内固定', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    // 容器 box = demo 里 inline overflow:auto 的 div（勿用祖先 filter——匹配过宽）
    const box = page.locator('main div[style*="overflow"]').last()
    const content2 = page.locator('main .wf-affix').nth(1).locator('.wf-affix-content')
    await box.evaluate((el) => { (el as HTMLElement).scrollTop = 99999 })
    await page.waitForFunction(() => {
      const c = document.querySelectorAll('main .wf-affix-content')[1]
      return c && getComputedStyle(c).position === 'fixed'
    }, null, { timeout: 3000 })
    assert.equal(await content2.evaluate((el) => getComputedStyle(el).top), '0px', '容器内 top=offsetTop(0)')
  } finally { await page.close() }
})
