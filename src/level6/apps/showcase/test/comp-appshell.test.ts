/**
 * showcase 组件测试——AppShell（/components/appshell）——全功能点固化
 * 清单：「AppShell」组（playwright 实测后固化）
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-appshell.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/appshell'

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
  await page.waitForSelector('main .wf-app-shell')
}

test('FP1/FP2/FP3 壳结构 + brand + nav 分组', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    const shell = page.locator('main .wf-app-shell').first()
    assert.ok(await shell.locator('.wf-sidebar').count(), 'sidebar')
    assert.ok(await shell.locator('.wf-main').count(), 'main 区')
    const text = await shell.textContent()
    assert.ok((text ?? '').includes('Demo Admin') && (text ?? '').includes('App Shell'), 'brand name+subtitle')
    for (const k of ['工作台', 'Agent', '部门', '管理', '系统']) assert.ok((text ?? '').includes(k), `nav 项/分组：${k}`)
    assert.ok((text ?? '').includes('张明') && (text ?? '').includes('admin@demo.com'), 'user name+email')
  } finally { await page.close() }
})

test('FP4/FP5 path 受控高亮 + onNavigate 回流（主区路由切换）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    const shell = page.locator('main .wf-app-shell').first()
    assert.ok((await page.evaluate(() => document.querySelector('main [class*="active"]')?.textContent ?? '')).includes('工作台'), '初始高亮（/ 精确）')
    await shell.locator('.wf-menu-item', { hasText: 'Agent' }).first().click()
    await page.waitForFunction(() => (document.querySelector('main')?.textContent ?? '').includes('/agents'), null, { timeout: 3000 })
    assert.ok((await page.evaluate(() => document.querySelector('main [class*="active"]')?.textContent ?? '')).includes('Agent'), '高亮迁移')
  } finally { await page.close() }
})

test('FP6 用户区动作：onSettings/onLogout 回流（toast 窗口内断言）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    const shell = page.locator('main .wf-app-shell').first()
    await shell.locator('.wf-sidebar-footer button[title="设置"]').first().click()
    await page.waitForFunction(() => (document.querySelector('main')?.textContent ?? '').includes('动作：打开设置'), null, { timeout: 3000 })
    await shell.locator('.wf-sidebar-footer button[title="退出登录"]').first().click()
    await page.waitForFunction(() => (document.querySelector('main')?.textContent ?? '').includes('动作：退出登录'), null, { timeout: 3000 })
  } finally { await page.close() }
})

test('FP7 loading 守卫骨架：不渲染菜单/用户 + 退出恢复', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.locator('main button', { hasText: '守卫加载态' }).first().click()
    await page.waitForTimeout(300)
    const loadingText = await page.locator('main .wf-app-shell').first().textContent()
    assert.ok(!(loadingText ?? '').includes('张明'), '用户区隐藏')
    assert.ok(!(loadingText ?? '').includes('Agent'), '菜单隐藏（骨架占位）')
    await page.locator('main button', { hasText: '退出守卫加载态' }).first().click()
    await page.waitForFunction(() => (document.querySelector('main .wf-app-shell')?.textContent ?? '').includes('张明'), null, { timeout: 3000 })
  } finally { await page.close() }
})
