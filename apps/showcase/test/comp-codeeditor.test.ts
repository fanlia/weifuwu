/**
 * showcase 组件测试——CodeEditor（/components/codeeditor）——全功能点固化
 * 清单：「CodeEditor」组（playwright 实测后固化）
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-codeeditor.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/codeeditor'

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

test('FP1 gutter 行号 = 代码行数', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main .wf-codeeditor')
    const n = await page.evaluate(() => document.querySelectorAll('main .wf-codeeditor-gutter > div').length)
    assert.ok(n >= 3, `行号数 ${n}`)
  } finally { await page.close() }
})

test('FP2 初值渲染（受控 value）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main .wf-codeeditor textarea')
    const v = await page.locator('main textarea').first().inputValue()
    assert.ok(v.includes('const greet'), '初值')
  } finally { await page.close() }
})

test('FP3 输入编辑：onChange 生效', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main .wf-codeeditor textarea')
    const ta = page.locator('main textarea').first()
    await ta.press('End')
    await ta.pressSequentially('// edited')
    await page.waitForFunction(() => (document.querySelector('main textarea') as HTMLTextAreaElement)?.value.includes('// edited'), null, { timeout: 3000 })
  } finally { await page.close() }
})

test('FP4 Tab 缩进：不移焦（preventDefault + 插入两空格）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main .wf-codeeditor textarea')
    const ta = page.locator('main textarea').first()
    await ta.click()
    await ta.press('Tab')
    const focused = await ta.evaluate((el) => document.activeElement === el)
    assert.equal(focused, true, '焦点保持（Tab 被拦截）')
  } finally { await page.close() }
})
