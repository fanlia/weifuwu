/**
 * showcase 组件测试——Grid（/components/grid）——全功能点固化
 * 清单：design/COMPONENT-VERIFICATION-CHECKLIST.md「Grid」组（playwright 实测后固化）
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-grid.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/grid'

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

test('FP1 span 24 栅格：1/3 与 1/2 面板宽度比 1:1.5', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main .wf-col')
    const geo = await page.evaluate(() => {
      const byText = (t) => [...document.querySelectorAll('main *')].filter((e) => e.textContent?.trim() === t && e.children.length === 0).map((e) => e.parentElement?.getBoundingClientRect().width)
      return { third: byText('1/3')[0], half: byText('1/2')[0] }
    })
    assert.ok(Math.abs(geo.half / geo.third - 1.5) < 0.05, `1/3=${Math.round(geo.third)} 1/2=${Math.round(geo.half)}`)
  } finally { await page.close() }
})

test('FP2 gutter=16：col 内 padding 半距模式内容间距', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main .wf-col')
    const gut = await page.evaluate(() => {
      const cols = [...document.querySelectorAll('main .wf-col')]
      const inner = (c) => c.firstElementChild?.getBoundingClientRect()
      const a = inner(cols[0]), b = inner(cols[1])
      return b ? b.left - a.right : -1
    })
    assert.ok(Math.abs(gut - 16) < 2, `内容间距 ${Math.round(gut)}px`)
  } finally { await page.close() }
})

test('FP3 flex 容器模式：弹性子项同排', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    const sameRow = await page.evaluate(() => {
      const a = [...document.querySelectorAll('main *')].filter((e) => e.textContent?.trim() === '弹性 A' && e.children.length === 0)[0]
      const b = [...document.querySelectorAll('main *')].filter((e) => e.textContent?.trim() === '弹性 B' && e.children.length === 0)[0]
      return a && b && Math.abs(a.getBoundingClientRect().y - b.getBoundingClientRect().y) < 5
    })
    assert.equal(sameRow, true, '同排')
  } finally { await page.close() }
})
