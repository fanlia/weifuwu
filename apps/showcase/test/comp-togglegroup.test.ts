/**
 * showcase 组件测试——ToggleGroup（/components/input/togglegroup）——完整能力
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-togglegroup.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/input/toggle-togglegroup'

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

test('能力：single 单选语义（互斥）+ multiple 多选累积 + Toggle 按压切换', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    const groups = page.locator('main .wf-toggle-group')
    // single 组：默认 bold pressed（aria-pressed=true）
    const single = groups.nth(0)
    const btns = single.locator('.wf-toggle')
    assert.equal(await btns.nth(0).getAttribute('aria-pressed'), 'true', '默认 bold 按下')
    // 点击 italic → italic 按下 + bold 弹起（单选互斥——aria-pressed 语义）
    await btns.nth(1).click()
    assert.equal(await btns.nth(1).getAttribute('aria-pressed'), 'true', 'italic 按下')
    assert.equal(await btns.nth(0).getAttribute('aria-pressed'), 'false', 'bold 弹起（互斥）')
    // multiple 组：默认 [a]——点击 b → a+b 同按（多选累积）
    const multi = groups.nth(1)
    const mbtns = multi.locator('.wf-toggle')
    assert.equal(await mbtns.nth(0).getAttribute('aria-pressed'), 'true', 'multi 默认 a')
    await mbtns.nth(1).click()
    assert.equal(await mbtns.nth(1).getAttribute('aria-pressed'), 'true', 'multi b 按下')
    assert.equal(await mbtns.nth(0).getAttribute('aria-pressed'), 'true', 'multi a 保持（累积）')
    // 独立 Toggle：点击 → 状态文本「已按下」
    await page.locator('main .wf-toggle', { hasText: '单个切换' }).click()
    await page.waitForFunction(() => (document.body.textContent ?? '').includes('状态：已按下'), 'Toggle 回流')
  } finally { await page.close() }
})
