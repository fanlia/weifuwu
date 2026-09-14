/**
 * showcase 组件测试——CodeBlock（/components/codeblock）——全功能点固化
 * 清单：「CodeBlock」组（playwright 实测后固化）
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-codeblock.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/codeblock'

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

test('FP1/FP2 title + lang 标签 + 代码内容渲染', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main pre, main [class*="code"]')
    const t = await page.evaluate(() => document.querySelector('main')?.textContent ?? '')
    assert.ok(t.includes('示例.ts') && t.includes('ts'), 'title+lang')
    assert.ok(t.includes('import { Markdown }'), '代码内容')
  } finally { await page.close() }
})

test('FP3 无 lang 实例（plain）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    const t = await page.evaluate(() => document.querySelector('main')?.textContent ?? '')
    assert.ok(t.includes('plain text 无语言标签'), '第二实例')
  } finally { await page.close() }
})

test('FP4 复制按钮 → 剪贴板内容 = 代码原文', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main .wf-codeblock-copy')
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
    await page.locator('main .wf-codeblock-copy').first().click()
    await page.waitForTimeout(300)
    const clip = await page.evaluate(() => navigator.clipboard.readText().catch(() => 'READ_FAIL'))
    assert.ok(String(clip).includes('import'), `剪贴板=${String(clip).slice(0, 30)}`)
  } finally { await page.close() }
})
