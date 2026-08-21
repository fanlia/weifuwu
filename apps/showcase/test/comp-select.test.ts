/**
 * showcase 组件测试——Select（/components/input/select）
 *
 * 每组件一个测试文件（单独运行）：
 *   node --env-file=.env --test apps/showcase/test/comp-select.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, assertPopupGeometry, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/input/select'

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

test('渲染零错误 + 选项（原生 select + 分组/错误变体）', async () => {
  const page = await browser.newPage()
  try {
    const errors = await openShowcase(page, BASE, COMP_PATH)
    assert.deepEqual(errors.filter((e) => !e.includes('Failed to load resource')), [], `零错误（实际: ${errors[0] ?? '无'}）`)
    const text = await page.evaluate(() => document.body.textContent ?? '')
    for (const t of ['请选择', '管理员', '请选择角色', '北京', '上海', '杭州']) {
      assert.ok(text.includes(t), `选项渲染：${t}`)
    }
  } finally {
    await page.close()
  }
})

test('demo 交互：选择「管理员」→ 当前值更新', async () => {
  const page = await browser.newPage()
  try {
    await openShowcase(page, BASE, COMP_PATH)
    const sel = page.locator('main .wf-surface select').first()
    await sel.selectOption('admin')
    await page.waitForFunction(() => (document.body.textContent ?? '').includes('当前值: admin'), '当前值更新', { timeout: 3000 })
  } finally {
    await page.close()
  }
})
