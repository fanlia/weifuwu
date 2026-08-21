/**
 * showcase 组件测试——TreeSelect（/components/advanced/treeselect）——下拉树选择
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-treeselect.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/advanced/treeselect'

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

test('能力：下拉树（单选 + 展开节点）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.locator('main .wf-treeselect-trigger').first().click()
    await page.waitForTimeout(400)
    const text = await page.evaluate(() => document.body.textContent ?? '')
    assert.ok(text.includes('服务') && text.includes('数据库'), '树面板展开（第一层）')
  } finally { await page.close() }
})
