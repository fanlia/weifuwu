/**
 * showcase 组件测试——Tabs（/components/navigation/tabs）——完整能力
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-tabs.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/navigation/tabs'

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

test('渲染零错误 + 3 标签（详情/设置/日志）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    const text = await page.evaluate(() => document.body.textContent ?? '')
    for (const t of ['详情', '设置', '日志']) assert.ok(text.includes(t), `标签：${t}`)
    assert.ok(text.includes('这是详情内容'), '详情内容激活')
  } finally { await page.close() }
})

test('能力：切换（onChange——点「设置」→ 内容切换）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.locator('main .wf-surface [role="tab"]', { hasText: '设置' }).first().click()
    await page.waitForFunction(() => (document.body.textContent ?? '').includes('这是设置内容'), '设置内容', { timeout: 3000 })
  } finally { await page.close() }
})

test('能力：可关闭（onClose——关闭激活 tab 自动激活邻居）+ 可新增（onAdd）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    // 新增（+ 按钮）→ 新标签出现且激活
    await page.locator('main .wf-surface [role="tab"] button, main .wf-surface button[aria-label*="新增"], main .wf-surface [class*="add"]').first().click()
    await page.waitForFunction(() => (document.body.textContent ?? '').includes('新标签 1'), '新增标签', { timeout: 3000 })
    // 关闭激活的「日志」→ 自动激活邻居（关闭按钮）
    const logTab = page.locator('main .wf-surface [role="tab"]', { hasText: '日志' }).first()
    await logTab.hover()
    await logTab.locator('button, [class*="close"]').first().click()
    await page.waitForFunction(() => !(document.body.textContent ?? '').includes('这是日志内容'), '日志关闭', { timeout: 3000 })
  } finally { await page.close() }
})
