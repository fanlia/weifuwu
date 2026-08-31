/**
 * showcase 组件测试——PageHeader（/components/pageheader）——完整能力
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-pageheader.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/pageheader'

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

test('渲染零错误 + title/sub + 操作区（新建用户/导出）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    const text = await page.evaluate(() => document.body.textContent ?? '')
    for (const t of ['用户管理', '管理平台所有用户的账号', '新建用户', '导出', '大标题模式']) assert.ok(text.includes(t), `渲染：${t}`)
  } finally { await page.close() }
})

test('能力：display 切换（按钮 → 大标题档）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.locator('main .wf-surface button', { hasText: '切换' }).first().click()
    await page.waitForFunction(() => (document.body.textContent ?? '').includes('可切换标题'), 'display 切换', { timeout: 3000 })
  } finally { await page.close() }
})
