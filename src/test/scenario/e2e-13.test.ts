/**
 * 组件深度场景 6——重组件（Kanban 拖拽/InfiniteScroll/CodeEditor/MarkdownEditor/Table 选择）
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startScenarioServer, openScenario, type ScenarioServer } from './e2e-shared.ts'

let server: ScenarioServer
let BASE = ''
let browser: Browser

test.before(async () => {
  server = await startScenarioServer()
  BASE = server.base
  browser = await chromium.launch()
})

test.after(async () => {
  await browser?.close()
  server?.stop()
})

test('deep-kanban：拖拽卡片跨列 → onMove', async () => {
  const page = await browser.newPage()
  try {
    await openScenario(page, BASE, 'deep-kanban')
    // HTML5 拖拽：卡一（待办）→ 完成列
    await page.evaluate(() => {
      const dt = new DataTransfer()
      const card = document.querySelector('[class*="kanban-card"], [class*="card"]')
      const cols = Array.from(document.querySelectorAll('[class*="kanban-col"]'))
      card?.dispatchEvent(new DragEvent('dragstart', { dataTransfer: dt, bubbles: true }))
      cols[1]?.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true }))
      cols[1]?.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true }))
      card?.dispatchEvent(new DragEvent('dragend', { dataTransfer: dt, bubbles: true }))
    })
    await page.waitForFunction(() => (document.querySelector('.deep-kanban-log')?.textContent ?? '').length > 0, '拖拽 → onMove', { timeout: 2500 })
  } finally {
    await page.close()
  }
})

test('deep-infinite：滚动触底 → onLoadMore（hasMore 循环）', async () => {
  const page = await browser.newPage()
  try {
    await openScenario(page, BASE, 'deep-infinite')
    // 初始内容（行 0-x）
    assert.ok(((await page.locator('.inf-content').textContent()) ?? '').includes('行 0-'), '初始内容')
    // 滚动容器到底 → 触底加载（hasMore true）
    await page.evaluate(() => {
      const el = document.querySelector('.deep-infinite-scene')
      el.scrollTop = el.scrollHeight
      el.dispatchEvent(new Event('scroll'))
    })
    await page.waitForFunction(() => (document.querySelector('.inf-content')?.textContent ?? '').includes('行 1-'), '触底 → loadMore（内容 1-x）', { timeout: 2500 })
  } finally {
    await page.close()
  }
})

test('deep-codeeditor：输入编辑 → onChange', async () => {
  const page = await browser.newPage()
  try {
    await openScenario(page, BASE, 'deep-codeeditor')
    const textarea = page.locator('.deep-codeeditor-scene textarea, .deep-codeeditor-scene [contenteditable]').first()
    await textarea.click()
    await page.keyboard.type('b = 2')
    await page.waitForFunction(() => (document.querySelector('.deep-codeeditor-log')?.textContent ?? '').length > 0, '编辑 → onChange', { timeout: 2500 })
  } finally {
    await page.close()
  }
})

test('deep-mdeditor：输入编辑 → onChange', async () => {
  const page = await browser.newPage()
  try {
    await openScenario(page, BASE, 'deep-mdeditor')
    const textarea = page.locator('.deep-mdeditor-scene textarea, .deep-mdeditor-scene [contenteditable]').first()
    await textarea.click()
    await page.keyboard.type('正文内容')
    await page.waitForFunction(() => (document.querySelector('.deep-mdeditor-log')?.textContent ?? '').length > 0, '编辑 → onChange', { timeout: 2500 })
  } finally {
    await page.close()
  }
})

test('deep-tableselect：行选择 → onSelectChange', async () => {
  const page = await browser.newPage()
  try {
    await openScenario(page, BASE, 'deep-tableselect')
    // 第一行 checkbox 选择
    const cb = page.locator('.deep-tableselect-scene .wf-table input[type="checkbox"], .deep-tableselect-scene [class*="select"] input[type="checkbox"]').first()
    await cb.click({ force: true })
    await page.waitForFunction(() => (document.querySelector('.deep-tableselect-log')?.textContent ?? '').includes('v:a'), '选择第一行 → onSelectChange([a])', { timeout: 2500 })
  } finally {
    await page.close()
  }
})
