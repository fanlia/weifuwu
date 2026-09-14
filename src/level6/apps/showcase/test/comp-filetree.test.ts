/**
 * showcase 组件测试——FileTree（/components/filetree）——全功能点固化
 * 清单：「FileTree」组（playwright 实测后固化）
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-filetree.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/filetree'

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

test('FP1/FP2 根目录列表 + 面包屑进目录', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main .wf-filetree-item')
    const t = await page.evaluate(() => document.querySelector('main')?.textContent ?? '')
    for (const w of ['docs', 'src', 'README.md']) assert.ok(t.includes(w), w)
    await page.locator('main .wf-filetree-item', { hasText: 'docs' }).first().click()
    await page.waitForFunction(() => [...document.querySelectorAll('main .wf-filetree-crumb')].some((c) => (c.textContent ?? '') === 'docs'), null, { timeout: 3000 })
  } finally { await page.close() }
})

test('FP3/FP4 打开文件编辑态（textarea）+ 返回列表', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main .wf-filetree-item')
    await page.locator('main .wf-filetree-item', { hasText: 'README.md' }).first().click()
    await page.waitForSelector('main .wf-filetree-editor-area', { timeout: 3000 })
    assert.ok(await page.locator('main button', { hasText: '保存' }).count() >= 1, '保存按钮')
    await page.locator('main button', { hasText: '返回列表' }).first().click()
    await page.waitForSelector('main .wf-filetree-list', { timeout: 3000 })
  } finally { await page.close() }
})
