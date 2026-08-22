/**
 * showcase 组件测试——AppShell（/components/navigation/appshell）——完整能力
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-appshell.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/navigation/appshell'

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

test('能力：品牌区 + 导航分组 + 用户区渲染', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    const shell = page.locator('.wf-app-shell')
    assert.ok(await shell.count() > 0, 'AppShell 渲染')
    // 品牌
    await page.waitForFunction(() => (document.body.textContent ?? '').includes('Demo Admin'), '品牌名', { timeout: 4000 })
    // 用户区
    await page.waitForFunction(() => (document.body.textContent ?? '').includes('admin@demo.com'), '用户邮箱', { timeout: 4000 })
    // 分组菜单
    await page.waitForFunction(() => (document.body.textContent ?? '').includes('工作台') && (document.body.textContent ?? '').includes('运营报表'), '菜单项', { timeout: 4000 })
    // 设置/退出按钮（title 属性）
    assert.equal(await page.locator('button[title="设置"]').count(), 1, '设置按钮')
    assert.equal(await page.locator('button[title="退出登录"]').count(), 1, '退出按钮')
  } finally { await page.close() }
})

test('能力：菜单导航（点击 → 主内容区切换 + activeKey 跟随）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    // 点击 Agent 菜单
    await page.locator('.wf-menu-item', { hasText: 'Agent' }).click()
    await page.waitForFunction(() => (document.body.textContent ?? '').includes('当前页面：/agents'), '内容切换', { timeout: 4000 })
    // activeKey 跟随（菜单激活态）
    const active = await page.locator('.wf-menu-item--active, .wf-menu-item[aria-selected="true"], .wf-menu-item.wf-nav-item--active').count()
    assert.ok(active >= 1, `菜单激活态（实际 ${active}）`)
    // 点击工作台回根
    await page.locator('.wf-menu-item', { hasText: '工作台' }).first().click()
    await page.waitForFunction(() => (document.body.textContent ?? '').includes('主内容区——当前路由 /'), '回工作台', { timeout: 4000 })
  } finally { await page.close() }
})

test('能力：设置/退出回调触发（动作提示显示）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.locator('button[title="设置"]').click()
    await page.waitForFunction(() => (document.body.textContent ?? '').includes('动作：打开设置'), '设置回调', { timeout: 4000 })
    await page.locator('button[title="退出登录"]').click()
    await page.waitForFunction(() => (document.body.textContent ?? '').includes('动作：退出登录'), '退出回调', { timeout: 4000 })
  } finally { await page.close() }
})

test('能力：主内容区渲染（children 透传 + 无崩溃）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    const main = page.locator('main.wf-main')
    assert.ok(await main.count() > 0, '主内容区')
    await page.waitForFunction(() => (document.body.textContent ?? '').includes('主内容区——当前路由 /'), 'children 渲染', { timeout: 4000 })
  } finally { await page.close() }
})
