/**
 * showcase 组件测试——Field（/components/form/field）——完整能力
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-field.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/form/field'

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

test('能力：label/required(*)/error/hint 四态渲染（语义断言）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    const main = page.locator('main')
    // required → *（wf-field-req）
    const reqField = main.locator('.wf-field').filter({ hasText: '姓名' }).first()
    assert.equal(await reqField.locator('.wf-field-req').count(), 1, 'required → *')
    assert.ok((await reqField.locator('.wf-field-label').textContent())?.includes('姓名'), 'label 渲染')
    // error → 错误文本（wf-field-err）
    const errField = main.locator('.wf-field').filter({ hasText: '邮箱' }).first()
    const errText = await errField.locator('.wf-field-err').textContent()
    assert.equal(errText?.trim(), '邮箱格式不正确', 'error 文本')
    // hint → 提示文本
    const hintField = main.locator('.wf-field').filter({ hasText: '密码' }).first()
    const hintText = await hintField.textContent()
    assert.ok(hintText?.includes('至少 6 位'), 'hint 提示')
    assert.equal(await hintField.locator('.wf-field-err').count(), 0, '无 error——不渲染错误位')
  } finally { await page.close() }
})
