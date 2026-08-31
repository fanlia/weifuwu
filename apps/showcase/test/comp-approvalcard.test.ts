/**
 * showcase 组件测试——ApprovalCard（/components/approvalcard）——全功能点固化
 * 清单：design/COMPONENT-VERIFICATION-CHECKLIST.md「ApprovalCard」组（playwright 实测后固化）
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-approvalcard.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/approvalcard'

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
  await page.waitForSelector('main .wf-approval')
}

test('FP1/FP2 渲染面 + 状态态：name/args/reason + approved/rejected 语义类', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    const t = await page.evaluate(() => document.querySelector('main')?.textContent ?? '')
    assert.ok(t.includes('place_order') && t.includes('qty') && t.includes('单笔超限'), 'name/args/reason 渲染')
    assert.ok(await page.locator('.wf-approval--approved').count(), 'approved 态')
    assert.ok(await page.locator('.wf-approval--rejected').count(), 'rejected 态')
  } finally { await page.close() }
})

test('FP3 允许 → loading 防连点（提交中禁用）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    const cards = page.locator('main .wf-approval')
    await cards.nth(0).locator('button', { hasText: '允许' }).first().click()
    const loadingBtn = cards.nth(0).locator('button', { hasText: '提交中' }).first()
    await loadingBtn.waitFor({ timeout: 3000 })
    assert.equal(await loadingBtn.isDisabled(), true, '提交中禁用（防连点）')
  } finally { await page.close() }
})

test('FP4 修改参数：JsonSchemaForm 预填 → 改值提交 → modified 回流', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    const card = page.locator('main .wf-approval').nth(1)
    await card.locator('button', { hasText: '修改参数' }).first().click()
    const qtyInput = card.locator('input').first()
    await qtyInput.waitFor({ timeout: 3000 })
    assert.equal(await qtyInput.inputValue(), '2', 'schema 预填 request.args')
    await qtyInput.fill('5')
    await card.locator('button', { hasText: '以修改后参数批准' }).first().click()
    await page.waitForFunction(() => (document.querySelector('main')?.textContent ?? '').includes('qty=5'), null, { timeout: 3000 })
  } finally { await page.close() }
})

test('FP5 拒绝两段式：拒绝 → 备注框 → 确认拒绝', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    const card = page.locator('main .wf-approval').nth(0)
    await card.locator('button', { hasText: '拒绝' }).first().click()
    const noteBox = card.locator('input, textarea').first()
    await noteBox.waitFor({ timeout: 3000 })
    await noteBox.fill('风险过高')
    await card.locator('button', { hasText: '确认拒绝' }).first().click()
    await page.waitForTimeout(200)
  } finally { await page.close() }
})
