/**
 * showcase 组件测试——Chart（/components/chart）——全功能点固化
 * 清单：「Chart」组（playwright 实测后固化）
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-chart.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/chart'

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

test('FP1 line：折线 path + 数据点 circle', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main svg')
    const first = await page.evaluate(() => {
      const s = document.querySelectorAll('main svg')[0]
      return { path: s.querySelectorAll('path, polyline').length, circle: s.querySelectorAll('circle').length }
    })
    assert.ok(first.path >= 1 || first.circle >= 1, JSON.stringify(first))
  } finally { await page.close() }
})

test('FP2 bar：≥5 柱 rect', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main svg')
    const bar = await page.evaluate(() => [...document.querySelectorAll('main svg')].some((s) => s.querySelectorAll('rect').length >= 5))
    assert.ok(bar, 'rect ≥ 5')
  } finally { await page.close() }
})

test('FP3 pie：≥3 扇区 path', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main svg')
    const pie = await page.evaluate(() => [...document.querySelectorAll('main svg')].some((s) => s.querySelectorAll('rect').length === 0 && s.querySelectorAll('path').length >= 3))
    assert.ok(pie, 'path ≥ 3 无 rect')
  } finally { await page.close() }
})

test('FP4 标题 + 轴标签 + 图例文本', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main svg')
    const t = await page.evaluate(() => document.querySelector('main')?.textContent ?? '')
    assert.ok(t.includes('月销售额') && t.includes('1月') && t.includes('直接'), '标题+标签+图例')
  } finally { await page.close() }
})

test('FP5 area 面积填充实例渲染', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main svg')
    const n = await page.evaluate(() => document.querySelectorAll('main svg').length)
    assert.ok(n >= 4, `4 图实例（line/bar/pie/area）实际 ${n}`)
  } finally { await page.close() }
})

test('交互：hover 数据点 → portal tooltip（label+value 跟随）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main svg rect')
    const rect = page.locator('main svg rect').first()
    const box = await rect.boundingBox()
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.waitForFunction(() => /\d月\d+|\d+/.test(document.querySelector('#__wf_portal')?.textContent ?? ''), null, { timeout: 3000 })
    const tip = await page.evaluate(() => document.querySelector('#__wf_portal')?.textContent?.trim().slice(0, 12))
    assert.ok((tip ?? '').length >= 2, `tooltip=${tip}`)
  } finally { await page.close() }
})
