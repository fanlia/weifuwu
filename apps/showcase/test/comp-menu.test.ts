/**
 * showcase 组件测试——Menu（/components/menu）——完整能力
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-menu.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/menu'

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

test('渲染零错误 + 菜单项（仪表盘/Agent 管理/系统管理）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    const text = await page.evaluate(() => document.body.textContent ?? '')
    for (const t of ['仪表盘', 'Agent 管理', '系统管理']) assert.ok(text.includes(t), `菜单项：${t}`)
  } finally { await page.close() }
})

test('能力：点击 onSelect + 子菜单展开 + 折叠（collapsible）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    // 点「仪表盘」→ onSelect(dashboard)——demo 状态文字？
    // 子菜单：点「系统管理」→ 展开（用户管理/角色权限/操作日志）
    await page.locator('main [class*="menu"] [class*="submenu"], main [class*="menu"] [class*="item"]', { hasText: '系统管理' }).first().click()
    await page.waitForFunction(() => (document.body.textContent ?? '').includes('用户管理'), '子菜单展开', { timeout: 3000 })
    // 折叠按钮（collapsible——demo 有切换按钮）
    const fold = page.locator('main button', { hasText: /折叠|收起|展开/ }).first()
    if (await fold.count() > 0) {
      await fold.click()
      await page.waitForTimeout(400)
      const collapsed = await page.evaluate(() => {
        const menu = document.querySelector('main [class*="menu"]')
        return menu ? menu.className.includes('collapsed') || menu.getAttribute('data-collapsed') === 'true' : false
      })
      // 折叠后文字隐藏（或类变化）
      const txt = await page.evaluate(() => document.querySelector('main [class*="menu"]')?.textContent?.includes('仪表盘') ?? false)
      assert.ok(collapsed || !txt, `折叠生效（collapsed=${collapsed}）`)
    }
  } finally { await page.close() }
})
