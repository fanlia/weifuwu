/**
 * showcase 组件测试——CheckboxGroup（/components/checkboxgroup）——完整能力
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-checkboxgroup.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/checkboxgroup'

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

test('能力：选项渲染 + 受控选中 + 点击换选（值回流——onChange 驱动 demo 文本）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    const group = page.locator('.wf-checkbox-group')
    assert.equal(await group.locator('.wf-checkbox').count(), 3, '3 选项')
    // 默认已选 [a]（张三）——checked 语义（input 视觉隐藏——点击 label）
    const boxes = group.locator('input[type="checkbox"]')
    assert.equal(await boxes.nth(0).isChecked(), true, '默认选中张三')
    assert.equal(await boxes.nth(1).isChecked(), false, '李四未选')
    // 点击李四 → 已选 a,b（demo 文本回流——受控链）
    await group.locator('.wf-checkbox').nth(1).click()
    await page.waitForFunction(() => (document.body.textContent ?? '').includes('已选：a, b') || (document.body.textContent ?? '').includes('已选：a, 李四'), '回流文本')
    // 再点王五 → 已选 a,b,c
    await group.locator('.wf-checkbox').nth(2).click()
    await page.waitForFunction(() => (document.body.textContent ?? '').includes('已选：a, b, c'), '多选累积')
    // 取消李四 → 已选 a,c
    await group.locator('.wf-checkbox').nth(1).click()
    await page.waitForFunction(() => (document.body.textContent ?? '').includes('已选：a, c') || !(document.body.textContent ?? '').includes('已选：a, b, c'), '取消选中')
  } finally { await page.close() }
})
