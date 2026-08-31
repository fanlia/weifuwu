/**
 * showcase 组件测试——Button（/components/button）
 *
 * 每组件一个测试文件（单独运行）：
 *   node --env-file=.env --test apps/showcase/test/comp-button.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/button'

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

test('渲染零错误 + 变体（primary/secondary/ghost/danger/尺寸/disabled/block）', async () => {
  const page = await browser.newPage()
  try {
    const errors = await openShowcase(page, BASE, COMP_PATH)
    assert.deepEqual(errors.filter((e) => !e.includes('Failed to load resource')), [], `零错误（实际: ${errors[0] ?? '无'}）`)
    const text = await page.evaluate(() => document.body.textContent ?? '')
    for (const t of ['Secondary', 'Ghost', 'Danger', 'Small', 'Medium', 'Large', 'Disabled']) {
      assert.ok(text.includes(t), `变体渲染：${t}`)
    }
  } finally {
    await page.close()
  }
})

test('demo 交互：点击计数 + Loading 切换', async () => {
  const page = await browser.newPage()
  try {
    await openShowcase(page, BASE, COMP_PATH)
    // 点击计数（初始「点击 0 次」→ 点击 → 「点击 1 次」）
    await page.waitForFunction(() => (document.body.textContent ?? '').includes('点击 0 次'), '初始 0 次', { timeout: 3000 })
    await page.locator('main .wf-surface button', { hasText: '点击 0 次' }).first().click()
    await page.waitForFunction(() => (document.body.textContent ?? '').includes('点击 1 次'), '点击 1 次', { timeout: 3000 })
    // Loading 按钮（点击 → 文案变「加载中...」+ disabled；1.5s 后恢复）
    await page.locator('main .wf-surface button', { hasText: '点我 Loading' }).first().click()
    await page.waitForFunction(() => (document.body.textContent ?? '').includes('加载中...'), 'loading 态（文案替换）', { timeout: 3000 })
    await page.waitForFunction(() => !(document.body.textContent ?? '').includes('加载中...'), 'loading 恢复', { timeout: 3000 })
  } finally {
    await page.close()
  }
})
