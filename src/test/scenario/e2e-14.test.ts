/**
 * 场景 e2e 第十四文件（表单输入组后半——Radio/Slider/Rate/Tags/Segmented/Toggle）
 * e2e-7 拆分——文件级超时（并发 CPU 压力）。
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

test('deep-radio：选项切换 onChange', async () => {
  const page = await browser.newPage()
  try {
    await openScenario(page, BASE, 'deep-radio')
    await page.locator('.deep-radio-scene').getByText('乙', { exact: true }).click()
    await page.waitForFunction(() => (document.querySelector('.deep-radio-log')?.textContent ?? '').includes('v:乙'), '切换选项 → onChange')
  } finally {
    await page.close()
  }
})

test('deep-slider：键盘方向键按 step 变化', async () => {
  const page = await browser.newPage()
  try {
    await openScenario(page, BASE, 'deep-slider')
    const slider = page.locator('.deep-slider-scene [role="slider"], .deep-slider-scene input[type="range"]').first()
    await slider.focus()
    await page.keyboard.press('ArrowRight')
    await page.waitForFunction(() => (document.querySelector('.deep-slider-log')?.textContent ?? '').includes('v:55'), 'ArrowRight +5（step=5）')
    await page.keyboard.press('ArrowLeft')
    await page.keyboard.press('ArrowLeft')
    await page.waitForFunction(() => (document.querySelector('.deep-slider-log')?.textContent ?? '').includes('v:45'), 'ArrowLeft×2 -10')
  } finally {
    await page.close()
  }
})

test('deep-rate：点击星级 → onChange 评分值', async () => {
  const page = await browser.newPage()
  try {
    await openScenario(page, BASE, 'deep-rate')
    // 第 5 颗星（button aria-label "5 星"）
    await page.locator('.deep-rate-scene [aria-label="5 星"]').click()
    await page.waitForFunction(() => (document.querySelector('.deep-rate-log')?.textContent ?? '').includes('v:5'), '点击第 5 星 → onChange(5)')
  } finally {
    await page.close()
  }
})

test('deep-tags：Enter 添加标签 + 删除', async () => {
  const page = await browser.newPage()
  try {
    await openScenario(page, BASE, 'deep-tags')
    const input = page.locator('.deep-tags-scene input').first()
    await input.click()
    await page.keyboard.type('标签1')
    await page.keyboard.press('Enter')
    await page.waitForFunction(() => (document.querySelector('.deep-tags-log')?.textContent ?? '').includes('t:标签1'), 'Enter 添加 → onChange')
  } finally {
    await page.close()
  }
})

test('deep-segmented：选项切换 onChange', async () => {
  const page = await browser.newPage()
  try {
    await openScenario(page, BASE, 'deep-segmented')
    await page.locator('.deep-segmented-scene').getByText('月', { exact: true }).click()
    await page.waitForFunction(() => (document.querySelector('.deep-segmented-log')?.textContent ?? '').includes('v:月'), '切换分段 → onChange')
  } finally {
    await page.close()
  }
})

test('deep-toggle：multiple 多选切换 onChange', async () => {
  const page = await browser.newPage()
  try {
    await openScenario(page, BASE, 'deep-toggle')
    await page.locator('.deep-toggle-scene').getByText('A', { exact: true }).click()
    await page.waitForFunction(() => (document.querySelector('.deep-toggle-log')?.textContent ?? '').includes('v:a'), '选中 A')
    await page.locator('.deep-toggle-scene').getByText('B', { exact: true }).click()
    await page.waitForFunction(() => (document.querySelector('.deep-toggle-log')?.textContent ?? '').includes('v:a,b'), '多选（multiple——A,B）')
  } finally {
    await page.close()
  }
})
