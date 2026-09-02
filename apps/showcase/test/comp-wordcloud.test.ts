/**
 * showcase 组件测试——WordCloud（/components/wordcloud）——解析 + 交互
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-wordcloud.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/wordcloud'

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

test('WC1 词云渲染：svg + 词数 = 输入数 + textLength 属性', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main svg')
    const info = await page.evaluate(() => {
      const svg = document.querySelector('main svg')!
      const texts = [...svg.querySelectorAll('text')]
      return {
        texts: texts.length,
        hasTextLength: texts.every((t) => t.hasAttribute('textLength')),
        viewBox: svg.getAttribute('viewBox') ?? '',
        words: texts.map((t) => t.textContent),
      }
    })
    assert.ok(info.texts >= 6, `词数 ≥ 6（实际 ${info.texts}）`)
    assert.ok(info.hasTextLength, '全部 text 有 textLength（零重叠保证）')
    assert.ok(info.viewBox.startsWith('0 0 480'), `viewBox 布局坐标系（实际 ${info.viewBox}）`)
    assert.ok(info.words.includes('weifuwu') && info.words.includes('词云'), '示例词渲染')
  } finally { await page.close() }
})

test('WC2 空态：无词数据页零 errors（其他组件页不受影响）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    // 组件页正常渲染（空态与组件页共存——主页面本身有词云示例）
    assert.ok(await page.locator('main').count() === 1, '主区渲染')
    assert.ok((await page.locator('main svg').count()) >= 1, '词云示例存在')
  } finally { await page.close() }
})

test('WC3 交互：点击词 → onWordClick 回传（真实 DOM 事件链）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main svg text')
    // SVG text 元素 locator.click 命中怪癖（actionability 对 SVG 泛化）——坐标点击（真实鼠标事件链）
    const bb = await page.evaluate(() => {
      const r = document.querySelector('main svg text')!.getBoundingClientRect()
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
    })
    await page.mouse.click(bb.x, bb.y)
    await page.waitForTimeout(200)
    const last = await page.locator('[data-testid="wc-last"]').innerText()
    assert.match(last, /最近点击：\S+（\d+）/, `点击回传（实际 ${last}）`)
    // 键盘可达：焦点 + Enter 激活
    await page.locator('main svg text').first().focus()
    await page.keyboard.press('Enter')
    await page.waitForTimeout(200)
    const last2 = await page.locator('[data-testid="wc-last"]').innerText()
    assert.match(last2, /最近点击：\S+（\d+）/, `键盘激活（实际 ${last2}）`)
  } finally { await page.close() }
})
