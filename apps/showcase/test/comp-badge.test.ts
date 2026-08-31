/**
 * showcase 组件测试——Badge（/components/badge）——全功能点固化
 * 清单：design/COMPONENT-VERIFICATION-CHECKLIST.md「Badge」组（playwright 实测后固化）
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-badge.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/badge'

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

test('FP1 variant 六态渲染（默认/primary/success/warning/danger/info）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main [class*="badge"]')
    const t = await page.evaluate(() => document.querySelector('main')?.textContent ?? '')
    for (const w of ['默认', '主要', '成功', '警告', '危险', '信息']) assert.ok(t.includes(w), w)
    const variantCls = await page.evaluate(() => [...document.querySelectorAll('main [class*="badge"]')].flatMap((b) => [...b.classList].filter((c) => c.includes('--'))))
    assert.ok(variantCls.length >= 5, `语义类 ${variantCls.join(',')}`)
  } finally { await page.close() }
})

test('FP2 dot 红点 + count 数值 + overflowCount N+（showZero 隐藏）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main [class*="badge"]')
    const t = await page.evaluate(() => document.querySelector('main')?.textContent ?? '')
    assert.ok(t.includes('在线') && t.includes('离线'), 'dot 实例')
    assert.ok(t.includes('5'), 'count=5')
    assert.ok(t.includes('99+'), '溢出阈值 overflowCount=99')
    assert.ok(t.includes('0'), 'showZero=true 显式显示 0')
    const zeroAbsent = await page.evaluate(() => document.querySelector('main [data-badge-zero]') === null)
    assert.equal(zeroAbsent, true, '默认 count=0 不渲染（showZero=false——隐藏形态 = 无节点）')
  } finally { await page.close() }
})
