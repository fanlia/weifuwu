/**
 * showcase 组件测试——Collapse（/components/collapse）——全功能点固化
 * 清单：design/COMPONENT-VERIFICATION-CHECKLIST.md「Collapse」组（playwright 实测后固化）
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-collapse.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/collapse'

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

test('FP1 初始 active=[\'1\']：第一项展开 + 内容可见', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main .wf-collapse')
    const open0 = await page.evaluate(() => document.querySelectorAll('main .wf-collapse-item--open').length)
    assert.equal(open0, 1, '仅第一项展开')
    const t = await page.evaluate(() => document.querySelector('main')?.textContent ?? '')
    assert.ok(t.includes('文档分块内容展示'), 'content 可见')
  } finally { await page.close() }
})

test('FP3 extra 操作区渲染', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main .wf-collapse')
    assert.ok(await page.locator('main .wf-collapse-extra').count() >= 1, 'extra 容器')
    const t = await page.evaluate(() => document.querySelector('main')?.textContent ?? '')
    assert.ok(t.includes('操作'), '操作按钮')
  } finally { await page.close() }
})

test('FP4/FP2 点击第二项多开（multiple 默认）→ loading 面可见', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main .wf-collapse')
    const item2 = page.locator('main .wf-collapse-header', { hasText: '异步加载示例' }).first()
    await item2.click()
    await page.waitForFunction(() => document.querySelectorAll('main .wf-collapse-item--open').length >= 2, null, { timeout: 3000 })
    await page.waitForSelector('main .wf-collapse-loading', { timeout: 3000 })
  } finally { await page.close() }
})

test('FP5 再点收起：回到单开', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main .wf-collapse')
    const item2 = page.locator('main .wf-collapse-header', { hasText: '异步加载示例' }).first()
    await item2.click()
    await item2.click()
    await page.waitForFunction(() => document.querySelectorAll('main .wf-collapse-item--open').length === 1, null, { timeout: 3000 })
  } finally { await page.close() }
})
