/**
 * showcase 组件测试——AutoComplete（/components/autocomplete）——全功能点固化
 * 清单：「AutoComplete」组（playwright 实测后固化）
 * 修复回归：onInput open 已开时重渲染（过滤不更新实证）+ error 文案渲染面（F2 基线补齐）
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-autocomplete.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/autocomplete'

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
  await page.waitForSelector('main .wf-autocomplete-wrap')
}

test('FP1 输入联想过滤（open 已开重渲染回归）：输入「支付」→ 2 条', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    const input = page.locator('main .wf-autocomplete-wrap').nth(0).locator('input')
    await input.click()
    await input.fill('支付')
    await page.waitForFunction(() => document.querySelectorAll('#__wf_portal .wf-autocomplete-option').length === 2, null, { timeout: 3000 })
    const labels = await page.locator('#__wf_portal .wf-autocomplete-option').allTextContents()
    for (const l of labels) assert.ok(l.includes('支付'), `过滤结果：${l}`)
  } finally { await page.close() }
})

test('FP2 选择回流：点击选项 → 受控 value 回流 + 下拉收起', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    const input = page.locator('main .wf-autocomplete-wrap').nth(0).locator('input')
    await input.click()
    await input.fill('支付')
    await page.waitForSelector('#__wf_portal .wf-autocomplete-option', { timeout: 3000 })
    await page.locator('#__wf_portal .wf-autocomplete-option').first().click()
    await page.waitForFunction(() => (document.querySelector('main .wf-autocomplete-wrap input') as HTMLInputElement)?.value === '支付平台管理', null, { timeout: 3000 })
  } finally { await page.close() }
})

test('FP3 键盘导航：ArrowDown 高亮 + Enter 选择', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    const input = page.locator('main .wf-autocomplete-wrap').nth(0).locator('input')
    await input.click()
    await input.fill('订单')
    await page.waitForFunction(() => (document.querySelector('#__wf_portal .wf-autocomplete-dropdown')?.textContent ?? '').includes('订单中心'), null, { timeout: 3000 })
    await input.press('ArrowDown')
    await input.press('Enter')
    await page.waitForFunction(() => (document.querySelector('main .wf-autocomplete-wrap input') as HTMLInputElement)?.value === '订单中心', null, { timeout: 3000 })
  } finally { await page.close() }
})

test('FP4/FP5 error 态（文案渲染面回归）+ disabled', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    const errInput = page.locator('main .wf-autocomplete-wrap').nth(1).locator('input')
    assert.equal(await errInput.getAttribute('aria-invalid'), 'true', 'aria-invalid')
    assert.ok(((await errInput.getAttribute('class')) ?? '').includes('--err'), '错误类')
    assert.ok(await page.locator('main .wf-input-err', { hasText: '该字段已存在' }).count(), '错误文案渲染（F2 基线补齐回归）')
    const disInput = page.locator('main .wf-autocomplete-wrap').nth(2).locator('input')
    assert.notEqual(await disInput.getAttribute('disabled'), null, 'disabled')
  } finally { await page.close() }
})

test('FP6 renderOption 自定义渲染（portal 内）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.locator('main .wf-autocomplete-wrap').nth(3).locator('input').click()
    await page.waitForSelector('#__wf_portal [data-ac-custom]', { timeout: 3000 })
    const labels = await page.locator('#__wf_portal [data-ac-custom]').allTextContents()
    assert.ok(labels.every((l) => l.includes('★')), `自定义前缀：${labels.join(',')}`)
  } finally { await page.close() }
})
