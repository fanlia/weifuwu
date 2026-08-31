/**
 * showcase 组件测试——NavMenu（/components/navmenu）——完整能力
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-navmenu.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/navmenu'

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

test('渲染零错误 + 菜单项（首页/文档/关于）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    const text = await page.evaluate(() => document.body.textContent ?? '')
    for (const t of ['首页', '文档', '关于']) assert.ok(text.includes(t), `菜单项：${t}`)
  } finally { await page.close() }
})

test('能力：点击 onSelect（active class）+ hover 子菜单展开（aria-expanded）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    // 点击「关于」→ onSelect(about)（demo 受控 active——active class）
    await page.locator('main .wf-navmenu-item', { hasText: '关于' }).first().click()
    await page.waitForFunction(() => {
      const el = Array.from(document.querySelectorAll('main .wf-navmenu-item')).find((x) => x.textContent?.trim() === '关于')
      return el ? el.className.includes('--active') : false
    }, 'onSelect(about)——active class', { timeout: 3000 })
    // hover「文档」→ 子菜单展开（aria-expanded true + 子项渲染）
    await page.locator('main .wf-navmenu-item', { hasText: '文档' }).first().hover()
    await page.waitForFunction(() => {
      const el = Array.from(document.querySelectorAll('main .wf-navmenu-item')).find((x) => x.textContent?.includes('文档'))
      return el?.getAttribute('aria-expanded') === 'true' || document.querySelector('main .wf-navmenu-sub-item') !== null
    }, 'hover 子菜单展开', { timeout: 3000 })
    // 子菜单在 portal（main 外——nestedPopup）
    const subItems = await page.evaluate(() => document.querySelectorAll('.wf-navmenu-sub-item').length)
    assert.ok(subItems >= 2, `子菜单项渲染（实际 ${subItems}——含 portal）`)
  } finally { await page.close() }
})

test('嵌套残留回归：hover API → 点击叶子 → portal 全空（死代码修复）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    // hover「文档」→ 子菜单
    await page.locator('main .wf-navmenu-item', { hasText: '文档' }).first().hover()
    await page.waitForFunction(() => document.querySelector('.wf-navmenu-sub-item') !== null, '子菜单展开', { timeout: 3000 })
    // hover「API」→ 嵌套子菜单（REST/WebSocket）
    await page.locator('.wf-navmenu-sub-item', { hasText: 'API' }).first().hover()
    await page.waitForFunction(() => document.querySelector('.wf-navmenu-sub--nested') !== null, '嵌套展开', { timeout: 3000 })
    // 点击叶子「REST」→ onSelect + 全部关闭（portal 零残留）
    await page.locator('.wf-navmenu-sub--nested .wf-navmenu-sub-item', { hasText: 'REST' }).first().click()
    await page.waitForFunction(() => (document.querySelector('#__wf_portal')?.children.length ?? 0) === 0, 'portal 全空（无残留）', { timeout: 3000 })
    // 状态同步（aria-expanded 清除）
    const expanded = await page.evaluate(() =>
      Array.from(document.querySelectorAll('main .wf-navmenu-item')).some((x) => x.getAttribute('aria-expanded') === 'true'))
    assert.equal(expanded, false, '关闭后 aria-expanded 全清除')
  } finally { await page.close() }
})
