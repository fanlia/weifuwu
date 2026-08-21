/**
 * 组件深度场景 2——选择组件（Select/AutoComplete/Cascader/TreeSelect/Transfer/ColorPicker/DatePicker/Calendar）
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

test('deep-select：点击展开 → 选项选择 → onChange', async () => {
  const page = await browser.newPage()
  try {
    await openScenario(page, BASE, 'deep-select')
    // 原生 select（选项选择——原生行为）
    await page.selectOption('.deep-select-scene select', 'b')
    await page.waitForFunction(() => (document.querySelector('.deep-select-log')?.textContent ?? '').includes('v:b'), '选择香蕉 → onChange(b)')
  } finally {
    await page.close()
  }
})

test('deep-autocomplete：输入过滤 → 联想选项 → 选中 onChange', async () => {
  const page = await browser.newPage()
  try {
    await openScenario(page, BASE, 'deep-autocomplete')
    await page.locator('.deep-autocomplete-scene input').click()
    await page.keyboard.type('支付')
    await page.waitForSelector('.wf-popup, .wf-autocomplete-dropdown', { timeout: 2500 })
    // 下拉出现（含过滤选项）
    await page.waitForFunction(() => (document.querySelector('.wf-autocomplete-dropdown')?.textContent ?? '').includes('支付平台管理'), '联想下拉含匹配项', { timeout: 2500 })
    await page.locator('.wf-autocomplete-dropdown .wf-autocomplete-option').first().click()
    await page.waitForFunction(() => (document.querySelector('.deep-autocomplete-log')?.textContent ?? '').includes('v:支付平台管理'), '点击选项选中 → onChange', { timeout: 2500 })
  } finally {
    await page.close()
  }
})

test('deep-cascader：级联展开 → 二级选择 → onChange', async () => {
  const page = await browser.newPage()
  try {
    await openScenario(page, BASE, 'deep-cascader')
    await page.locator('.wf-cascader-trigger').click()
    await page.waitForSelector('.wf-cascader-panel', { timeout: 2500 })
    await page.locator('.wf-cascader-panel').getByText('浙江', { exact: true }).first().click()
    await page.locator('.wf-cascader-panel').getByText('杭州', { exact: true }).first().click()
    await page.waitForFunction(() => (document.querySelector('.deep-cascader-log')?.textContent ?? '').includes('hangzhou'), '二级选择 → onChange(zhejiang,hangzhou)', { timeout: 2500 })
  } finally {
    await page.close()
  }
})

test('deep-treeselect：树展开 → 节点选择 → onChange', async () => {
  const page = await browser.newPage()
  try {
    await openScenario(page, BASE, 'deep-treeselect')
    await page.locator('.wf-treeselect-trigger').click()
    await page.waitForSelector('.wf-treeselect-dropdown', { timeout: 2500 })
    // 叶子节点（节点2——最后一个树行）直接选择
    const rows = page.locator('.wf-treeselect-dropdown .wf-tree-row')
    await rows.last().click()
    await page.waitForFunction(() => (document.querySelector('.deep-treeselect-log')?.textContent ?? '').includes('2'), '叶子节点选择 → onChange', { timeout: 2500 })
  } finally {
    await page.close()
  }
})

test('deep-transfer：穿梭项 左→右 onChange', async () => {
  const page = await browser.newPage()
  try {
    await openScenario(page, BASE, 'deep-transfer')
    // 左侧选择项1 → 移动到右侧（wf-transfer-btn 第 2 个 = 向右——图标按钮）
    await page.locator('.deep-transfer-scene .wf-transfer-item').first().click()
    await page.waitForFunction(() => document.querySelector('.wf-transfer-item')?.classList.contains('wf-transfer-item--sel'), '项1 选中')
    await page.locator('.wf-transfer-btn').nth(1).click()
    await page.waitForFunction(() => (document.querySelector('.deep-transfer-log')?.textContent ?? '').includes('v:1'), '穿梭 → onChange([1])', { timeout: 2500 })
  } finally {
    await page.close()
  }
})

test('deep-colorpicker：打开色板 → 选色 onChange', async () => {
  const page = await browser.newPage()
  try {
    await openScenario(page, BASE, 'deep-colorpicker')
    await page.locator('.wf-color-picker-trigger').click()
    await page.waitForSelector('.wf-color-picker-panel', { timeout: 2500 })
    // 色板出现（swatch 色块——aria-label 色值）
    await page.waitForFunction(() => document.querySelectorAll('.wf-color-picker-swatch').length > 0, '色板面板打开（swatch 色块）', { timeout: 2500 })
  } finally {
    await page.close()
  }
})

test('deep-datepicker：打开日历 → 选日 onChange', async () => {
  const page = await browser.newPage()
  try {
    await openScenario(page, BASE, 'deep-datepicker')
    await page.locator('.wf-datepicker-input').click()
    await page.waitForSelector('.wf-datepicker-dropdown', { timeout: 2500 })
    // 点击某日（20 日——当前月）
    await page.locator('.wf-datepicker-dropdown').getByText('20', { exact: true }).first().click()
    await page.waitForFunction(() => (document.querySelector('.deep-datepicker-log')?.textContent ?? '').endsWith('-20;'), '选日 → onChange(20 日)', { timeout: 2500 })
  } finally {
    await page.close()
  }
})

test('deep-calendar：切换月份 → 选日 onChange', async () => {
  const page = await browser.newPage()
  try {
    await openScenario(page, BASE, 'deep-calendar')
    // 月份标题/下月按钮——点击某日（25 日——当前月）
    await page.locator('.deep-calendar-scene .wf-calendar').getByText('25', { exact: true }).first().click()
    await page.waitForFunction(() => (document.querySelector('.deep-calendar-log')?.textContent ?? '').endsWith('-25;'), '选日 → onChange(25 日)', { timeout: 2500 })
  } finally {
    await page.close()
  }
})
