/**
 * showcase 组件测试——JsonSchemaForm（/components/jsonschemaform）——全功能点固化
 * 清单：design/COMPONENT-VERIFICATION-CHECKLIST.md「JsonSchemaForm」组（playwright 实测后固化）
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-jsonschemaform.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/jsonschemaform'

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

test('FP1/FP2 schema 驱动渲染：string/integer/boolean/enum 四字段 + 初值', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main .wf-jsf')
    const t = await page.evaluate(() => document.querySelector('main')?.textContent ?? '')
    for (const w of ['query_weather 参数', '城市', '预报天数', '含天气详情', '单位', '执行工具']) assert.ok(t.includes(w), w)
    assert.equal(await page.locator('main .wf-jsf input:not([role="switch"])').count(), 2, 'string+integer 文本输入')
    assert.equal(await page.locator('main .wf-jsf select').count(), 1, 'enum select')
    assert.ok(await page.locator('main .wf-jsf .wf-switch').count() >= 1, 'boolean switch')
  } finally { await page.close() }
})

test('FP3 required 校验：空提交拦截（.wf-field-err）→ 键入清除 → 提交通过', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main .wf-jsf')
    await page.locator('main .wf-jsf input').first().fill('')
    await page.locator('main button', { hasText: '执行工具' }).first().click()
    await page.waitForFunction(() => document.querySelectorAll('main .wf-field-err').length === 1, null, { timeout: 3000 })
    await page.locator('main .wf-jsf input').first().fill('上海')
    await page.waitForFunction(() => document.querySelectorAll('main .wf-field-err').length === 0, null, { timeout: 3000 })
    await page.locator('main button', { hasText: '执行工具' }).first().click()
    await page.waitForTimeout(300)
    assert.equal(await page.evaluate(() => document.querySelectorAll('main .wf-field-err').length), 0, '提交后无错误')
  } finally { await page.close() }
})

test('FP4 enum select 联动（celsius→fahrenheit）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main .wf-jsf select')
    const sel = page.locator('main .wf-jsf select').first()
    await sel.selectOption('fahrenheit')
    await page.waitForFunction(() => document.querySelector('main .wf-jsf select')?.value === 'fahrenheit', null, { timeout: 3000 })
  } finally { await page.close() }
})

test('交互：表单 Enter 提交（校验/反馈路径）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main input')
    await page.locator('main input').first().focus()
    await page.keyboard.press('Enter')
    await page.waitForFunction(() => /提交|submit|成功|必填|错误/.test(document.querySelector('main')?.textContent ?? ''), null, { timeout: 3000 })
  } finally { await page.close() }
})
