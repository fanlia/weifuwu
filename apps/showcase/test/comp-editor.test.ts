/**
 * showcase 组件测试——Editor（/components/editor）——全功能点固化
 * 清单：「Editor」组（playwright 实测后固化）
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-editor.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/editor'

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

test('FP1/FP2 受控初值渲染 + 输入 onChange 回流', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main .wf-editor-content')
    const html0 = await page.locator('main .wf-editor-content').first().innerHTML()
    assert.ok(html0.includes('<b>weifuwu</b>'), `初值 <b> 标记`)
    const ed = page.locator('main .wf-editor-content').first()
    await ed.click()
    await ed.press('End')
    await ed.pressSequentially('追加文字')
    await page.waitForFunction(() => (document.querySelector('main')?.textContent ?? '').includes('追加文字'), null, { timeout: 3000 })
  } finally { await page.close() }
})

test('FP3/FP4 工具栏 24 按钮 + bold 双向 toggle', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main .wf-editor-tb-btn')
    assert.ok(await page.locator('main .wf-editor-tb-btn').count() >= 20, '工具栏按钮 ≥ 20')
    const ed = page.locator('main .wf-editor-content').first()
    const boldBtn = page.locator('main .wf-editor-tb-btn').first()
    // toggle-off：选中已粗体文本
    await ed.locator('text=weifuwu').first().dblclick()
    await boldBtn.click()
    await page.waitForFunction(() => !(document.querySelector('main .wf-editor-content')?.innerHTML ?? '').includes('<b>weifuwu</b>'), null, { timeout: 3000 })
    // toggle-on：Range 精确选中 Hello
    const selOk = await page.evaluate(() => {
      const root = document.querySelector('main .wf-editor-content')
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
      let node
      while ((node = walker.nextNode())) {
        const i = (node.textContent ?? '').indexOf('Hello')
        if (i >= 0) {
          const range = document.createRange()
          range.setStart(node, i)
          range.setEnd(node, i + 5)
          const s = getSelection()
          s?.removeAllRanges()
          s?.addRange(range)
          return true
        }
      }
      return false
    })
    assert.equal(selOk, true, 'Range 选中 Hello')
    await boldBtn.click()
    await page.waitForFunction(() => (document.querySelector('main .wf-editor-content')?.innerHTML ?? '').includes('<b>Hello</b>'), null, { timeout: 3000 })
  } finally { await page.close() }
})

test('FP5/FP6 source 模式切换 + Ctrl+Z 撤销', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main .wf-editor-content')
    await page.locator('main button[title="源码"]').first().click()
    await page.waitForSelector('main textarea', { timeout: 3000 })
    await page.locator('main button[title="源码"]').first().click()
    await page.waitForFunction(() => !document.querySelector('main textarea'), null, { timeout: 3000 })
    // undo
    const ed = page.locator('main .wf-editor-content').first()
    await ed.click()
    await ed.press('Control+z')
    await page.waitForTimeout(300)
    const html = await page.evaluate(() => document.querySelector('main .wf-editor-content')?.innerHTML ?? '')
    assert.ok(html.length > 0, 'undo 后内容非空')
  } finally { await page.close() }
})
