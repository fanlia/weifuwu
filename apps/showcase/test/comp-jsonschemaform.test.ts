/**
 * showcase 组件测试——JsonSchemaForm（/components/form/jsonschemaform）——完整能力
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-jsonschemaform.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/form/jsonschemaform'

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

test('能力：schema 驱动渲染（必填/单位/开关字段）+ 提交按钮', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    const main = page.locator('main')
    // schema 字段渲染（jsf-obj 容器——Field 组合——label 语义）
    const fields = main.locator('.wf-field')
    assert.ok((await fields.count()) >= 3, `字段数 ≥3（实际 ${await fields.count()}）`)
    const text = await main.textContent()
    assert.ok(text?.includes('城市'), '城市字段')
    assert.ok(text?.includes('预报天数') && text?.includes('含天气详情') && text?.includes('单位'), '天数/天气/单位字段')
    // 默认值（value='北京'——input 属性面）
    assert.equal(await main.locator('input[value="北京"]').count(), 1, 'city 默认值')
    assert.ok(text?.includes('天数'), '天数字段')
    assert.ok(text?.includes('天气'), '天气开关字段')
    // 提交按钮（submitLabel="执行工具"）
    assert.equal(await main.locator('button', { hasText: '执行工具' }).count(), 1, 'submitLabel 渲染')
  } finally { await page.close() }
})
