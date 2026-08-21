/**
 * 组件深度场景 3——导航 + 数据展示（Tabs/Menu/Pagination/Table/Collapse/Accordion/Carousel/Steps/List）
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

test('deep-tabs：切换标签 onChange', async () => {
  const page = await browser.newPage()
  try {
    await openScenario(page, BASE, 'deep-tabs')
    await page.locator('.deep-tabs-scene').getByText('标签B', { exact: true }).click()
    await page.waitForFunction(() => (document.querySelector('.deep-tabs-log')?.textContent ?? '').includes('v:b'), '切换标签B → onChange(b)')
  } finally {
    await page.close()
  }
})

test('deep-menu：菜单项点击 onSelect', async () => {
  const page = await browser.newPage()
  try {
    await openScenario(page, BASE, 'deep-menu')
    await page.locator('.deep-menu-scene').getByText('菜单二', { exact: true }).click()
    await page.waitForFunction(() => (document.querySelector('.deep-menu-log')?.textContent ?? '').includes('v:2'), '点击菜单二 → onSelect(2)')
  } finally {
    await page.close()
  }
})

test('deep-pagination：翻页 onChange', async () => {
  const page = await browser.newPage()
  try {
    await openScenario(page, BASE, 'deep-pagination')
    // 下一页（第 2 页）
    await page.locator('.deep-pagination-scene').getByText('2', { exact: true }).first().click()
    await page.waitForFunction(() => (document.querySelector('.deep-pagination-log')?.textContent ?? '').includes('v:2'), '翻到第 2 页 → onChange(2)')
  } finally {
    await page.close()
  }
})

test('deep-table：表头排序 onSortChange', async () => {
  const page = await browser.newPage()
  try {
    await openScenario(page, BASE, 'deep-table')
    await page.locator('.wf-table-th--sortable').first().click()
    await page.waitForFunction(() => (document.querySelector('.deep-table-log')?.textContent ?? '').includes('v:name:asc'), '点击表头排序 → onSort(name, asc)')
  } finally {
    await page.close()
  }
})

test('deep-collapse：展开折叠 onChange', async () => {
  const page = await browser.newPage()
  try {
    await openScenario(page, BASE, 'deep-collapse')
    await page.locator('.deep-collapse-scene').getByText('面板一', { exact: true }).click()
    await page.waitForFunction(() => (document.querySelector('.deep-collapse-log')?.textContent ?? '').includes('v:1'), '展开面板 → onChange([1])')
  } finally {
    await page.close()
  }
})

test('deep-accordion：展开折叠 onChange', async () => {
  const page = await browser.newPage()
  try {
    await openScenario(page, BASE, 'deep-accordion')
    await page.locator('.deep-accordion-scene').getByText('折叠一', { exact: true }).click()
    await page.waitForFunction(() => (document.querySelector('.deep-accordion-log')?.textContent ?? '').includes('v:1'), '展开折叠 → onChange([1])')
  } finally {
    await page.close()
  }
})

test('deep-carousel：下一张箭头切换（track 变换——无 onChange 回调接口）', async () => {
  const page = await browser.newPage()
  try {
    await openScenario(page, BASE, 'deep-carousel')
    // 下一张箭头 → track translateX(-100%)
    await page.locator('.deep-carousel-scene [aria-label="下一张"]').click()
    await page.waitForFunction(() => (document.querySelector('.wf-carousel-track')?.getAttribute('style') ?? '').includes('-100%'), '切到第 2 张（track 变换）')
    // 上一张 → 回到 0
    await page.locator('.deep-carousel-scene [aria-label="上一张"]').click()
    await page.waitForFunction(() => (document.querySelector('.wf-carousel-track')?.getAttribute('style') ?? '').includes('0%'), '回到第 1 张')
  } finally {
    await page.close()
  }
})

test('deep-steps：渲染（current 步状态）', async () => {
  const page = await browser.newPage()
  try {
    await openScenario(page, BASE, 'deep-steps')
    assert.equal(await page.locator('.deep-steps-state').textContent(), 'ok', '场景渲染正常')
    const steps = await page.evaluate(() => document.querySelectorAll('.deep-steps-scene .wf-steps-step, .deep-steps-scene [class*="step"]').length)
    assert.ok(steps >= 2, `步骤渲染（实际 ${steps}）`)
  } finally {
    await page.close()
  }
})

test('deep-list：renderItem 渲染（keyBy 契约——无 onItemClick 回调接口）', async () => {
  const page = await browser.newPage()
  try {
    await openScenario(page, BASE, 'deep-list')
    const items = await page.evaluate(() => Array.from(document.querySelectorAll('.wf-list-item')).map((el) => el.textContent))
    assert.deepEqual(items, ['项A', '项B'], 'renderItem 渲染两项')
  } finally {
    await page.close()
  }
})
