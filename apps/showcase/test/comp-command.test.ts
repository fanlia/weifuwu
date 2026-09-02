/**
 * showcase 组件测试——Command（/components/command）——全功能点固化
 * 清单：「Command」组（playwright 实测后固化）
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-command.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/command'

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

test('FP1 面板结构：输入框 + 3 items + shortcut kbd', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main button')
    await page.locator('main button', { hasText: '打开命令面板' }).first().click()
    await page.waitForSelector('#__wf_portal .wf-command-panel', { timeout: 3000 })
    const t = await page.evaluate(() => document.querySelector('#__wf_portal .wf-command-panel')?.textContent ?? '')
    for (const w of ['新建聊天', '搜索', '设置']) assert.ok(t.includes(w), w)
    assert.equal(await page.locator('#__wf_portal .wf-command-shortcut').count(), 3, 'kbd × 3')
  } finally { await page.close() }
})

test('FP2 关键词过滤 → 空态文案', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main button')
    await page.locator('main button', { hasText: '打开命令面板' }).first().click()
    await page.waitForSelector('#__wf_portal .wf-command-input', { timeout: 3000 })
    await page.locator('#__wf_portal .wf-command-input').fill('搜')
    await page.waitForFunction(() => {
      const l = document.querySelector('#__wf_portal .wf-command-list')?.textContent ?? ''
      return l.includes('搜索') && !l.includes('新建聊天')
    }, null, { timeout: 3000 })
    await page.locator('#__wf_portal .wf-command-input').fill('不存在xyz')
    await page.waitForSelector('#__wf_portal .wf-command-empty', { timeout: 3000 })
  } finally { await page.close() }
})

test('FP3 键盘导航 ArrowDown + Enter 选中 → 面板关闭', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main button')
    await page.locator('main button', { hasText: '打开命令面板' }).first().click()
    await page.waitForSelector('#__wf_portal .wf-command-input', { timeout: 3000 })
    await page.locator('#__wf_portal .wf-command-input').press('ArrowDown')
    await page.locator('#__wf_portal .wf-command-input').press('Enter')
    await page.waitForFunction(() => !document.querySelector('#__wf_portal .wf-command-panel'), null, { timeout: 3000 })
  } finally { await page.close() }
})

test('FP4 Escape 关闭', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main button')
    await page.locator('main button', { hasText: '打开命令面板' }).first().click()
    await page.waitForSelector('#__wf_portal .wf-command-input', { timeout: 3000 })
    await page.locator('#__wf_portal .wf-command-input').press('Escape')
    await page.waitForFunction(() => !document.querySelector('#__wf_portal .wf-command-panel'), null, { timeout: 3000 })
  } finally { await page.close() }
})

test('FP5 globalShortcut mod+k：Ctrl+K / Meta+K 都打开', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main button')
    await page.keyboard.press('Control+k')
    await page.waitForSelector('#__wf_portal .wf-command-panel', { timeout: 3000 })
    await page.keyboard.press('Escape')
    await page.waitForFunction(() => !document.querySelector('#__wf_portal .wf-command-panel'), null, { timeout: 3000 })
    await page.keyboard.press('Meta+k')
    await page.waitForSelector('#__wf_portal .wf-command-panel', { timeout: 3000 })
  } finally { await page.close() }
})
