/**
 * showcase 组件测试——ThemeSwitch（/components/themeswitch）——完整功能
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-themeswitch.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/themeswitch'

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
}

test('demo 交互：模式切换（自动/亮色/暗色——radio 选择）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    // ThemeSwitch 3 个模式（自动/亮色/暗色）
    const radios = page.locator('main .wf-surface [role="radio"]')
    assert.ok(await radios.count() >= 3, `模式选项（实际 ${await radios.count()}）`)
    // 点「暗色」→ html 主题切换（data-theme/class）
    await page.locator('main .wf-surface [role="radio"]', { hasText: '暗色' }).first().click()
    await page.waitForFunction(() => {
      const el = document.documentElement
      return el.getAttribute('data-theme') === 'dark' || el.classList.contains('dark') || (el.getAttribute('data-theme') ?? '').includes('dark')
    }, '暗色主题', { timeout: 3000 })
    // 点「亮色」→ 恢复
    await page.locator('main .wf-surface [role="radio"]', { hasText: '亮色' }).first().click()
    await page.waitForFunction(() => {
      const el = document.documentElement
      return el.getAttribute('data-theme') !== 'dark' && !el.classList.contains('dark')
    }, '亮色主题', { timeout: 3000 })
  } finally {
    await page.close()
  }
})

test('demo 交互：品牌换肤（seed 实时——html style 变量）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    // 预设主题按钮（默认/极简/紧凑/圆润）
    const btns = page.locator('main .wf-surface button')
    assert.ok(await btns.count() >= 4, `主题按钮（实际 ${await btns.count()}）`)
    // 品牌色 input（亮色——onChange → applySeeds → html style 变量）
    await page.evaluate(() => {
      const input = document.querySelector('main input[type="color"]') as HTMLInputElement
      input.value = '#ff0000'
      input.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await page.waitForTimeout(300)
    const seed = await page.evaluate(() => document.documentElement.style.getPropertyValue('--wf-brand-seed'))
    assert.equal(seed, '#ff0000', `品牌 seed 已应用（实际 ${seed}）`)
    // 重置 → seed 移除
    await page.locator('main .wf-surface button', { hasText: '重置' }).first().click()
    await page.waitForTimeout(200)
    const after = await page.evaluate(() => document.documentElement.style.getPropertyValue('--wf-brand-seed'))
    assert.equal(after, '', '重置清除 seed')
  } finally {
    await page.close()
  }
})

test('FP-追加 暗色模式实时生效（data-theme none→dark）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main .wf-theme-seg')
    await page.locator('main .wf-theme-seg', { hasText: '暗色' }).first().click()
    await page.waitForFunction(() => document.documentElement.getAttribute('data-theme') === 'dark', null, { timeout: 3000 })
  } finally { await page.close() }
})
