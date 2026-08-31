/**
 * showcase 组件测试——ChatInput（/components/chatinput）——全功能点固化
 * 清单：design/COMPONENT-VERIFICATION-CHECKLIST.md「ChatInput」组（playwright 实测后固化）
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-chatinput.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/chatinput'

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

test('FP1/FP2 单行 Enter 发送 + 空文本不触发（trim 语义）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main .wf-chat-inputbar')
    const inp = page.locator('main .wf-chat-inputbar').nth(0).locator('input')
    await inp.fill('你好')
    await inp.press('Enter')
    await page.waitForFunction(() => (document.querySelector('main')?.textContent ?? '').includes('已发送：你好'), null, { timeout: 3000 })
    await inp.press('Enter')
    await page.waitForTimeout(200)
    assert.ok(!(await page.evaluate(() => (document.querySelector('main')?.textContent ?? '').includes('已发送：你好 |'))), '空文本不追加')
  } finally { await page.close() }
})

test('FP3 多行：Shift+Enter 换行 / Enter 发送', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main .wf-chat-inputbar textarea')
    const ta = page.locator('main .wf-chat-inputbar').nth(1).locator('textarea')
    await ta.fill('第一行')
    await ta.press('Shift+Enter')
    await ta.pressSequentially('第二行')
    assert.ok((await ta.inputValue()).includes('\n'), '换行保留')
    await ta.press('Enter')
    await page.waitForFunction(() => (document.querySelector('main')?.textContent ?? '').includes('第一行'), null, { timeout: 3000 })
  } finally { await page.close() }
})

test('FP4 streaming：停止按钮出现 → 1.5s 自动复原', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main .wf-chat-inputbar')
    const bar = page.locator('main .wf-chat-inputbar').nth(2)
    await bar.locator('input').fill('测试流')
    await bar.locator('input').press('Enter')
    await page.waitForFunction(() => (document.querySelectorAll('main .wf-chat-inputbar')[2]?.textContent ?? '').includes('停止'), null, { timeout: 3000 })
    await page.waitForFunction(() => !(document.querySelectorAll('main .wf-chat-inputbar')[2]?.textContent ?? '').includes('停止'), null, { timeout: 3000 })
  } finally { await page.close() }
})

test('FP5/FP6 error→重试按钮（danger）+ disabled 双禁用', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main .wf-chat-inputbar')
    const retry = page.locator('main .wf-chat-inputbar').nth(3).locator('button.wf-btn--danger')
    assert.equal(await retry.count(), 1, 'danger 重试按钮')
    const disBar = page.locator('main .wf-chat-inputbar').nth(4)
    assert.equal(await disBar.locator('input').isDisabled(), true, 'input 禁用')
    assert.equal(await disBar.locator('button').first().isDisabled(), true, '按钮禁用')
  } finally { await page.close() }
})
