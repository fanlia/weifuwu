/**
 * showcase 组件测试——SearchInput（/components/searchinput）——完整能力
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-searchinput.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/searchinput'

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

test('能力：输入 onInput 回流（搜索词）+ 清空按钮 onClear', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    const input = page.locator('main .wf-search-input').first()
    assert.equal(await input.getAttribute('placeholder'), '搜索用户...', '占位符')
    await input.fill('张三')
    await page.waitForFunction(() => (document.body.textContent ?? '').includes('搜索词: 张三'), 'onInput 回流')
    // 清空按钮（受控 + 有值 + onClear → wf-search-clear）
    await page.locator('main .wf-search-clear').first().click()
    await page.waitForFunction(() => (document.body.textContent ?? '').includes('搜索词: (空)'), 'onClear 回流')
  } finally { await page.close() }
})
