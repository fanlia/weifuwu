/**
 * showcase 组件测试——List（/components/list）——全功能点固化
 * 清单：「List」组（playwright 实测后固化）
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-list.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/list'

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

test('FP1/FP2 header + renderItem 项渲染', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main [class*="list"]')
    const t = await page.evaluate(() => document.querySelector('main')?.textContent ?? '')
    assert.ok(t.includes('最近文件'), 'header')
    assert.ok(t.includes('需求文档.md') && t.includes('架构设计.pdf'), 'items')
  } finally { await page.close() }
})
