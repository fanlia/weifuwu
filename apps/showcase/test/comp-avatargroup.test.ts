/**
 * showcase 组件测试——AvatarGroup（/components/avatargroup）——完整能力
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-avatargroup.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/avatargroup'

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

test('能力：items 渲染 + max 溢出折叠 +N 计数（语义断言——非仅存在）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    // max=3 组：4 项 → 3 头像 + "+1"（aria-label「还有 1 人」）
    const firstGroup = await page.locator('.wf-avatar-group').first()
    assert.equal(await firstGroup.locator('.wf-avatar-group-item').count(), 3, 'max=3 截断为 3 头像')
    const more = firstGroup.locator('.wf-avatar-group-more')
    assert.equal(await more.textContent(), '+1', '溢出 +1')
    assert.equal(await more.getAttribute('aria-label'), '还有 1 人', 'aria-label 语义')
    // 无 max 组：2 项全渲染——无 +N
    const secondGroup = await page.locator('.wf-avatar-group').nth(1)
    assert.equal(await secondGroup.locator('.wf-avatar-group-item').count(), 2, '无 max——2 项全渲染')
    assert.equal(await secondGroup.locator('.wf-avatar-group-more').count(), 0, '无溢出——无 +N')
  } finally { await page.close() }
})
