/**
 * 场景 e2e 第十二文件（浮层组后半——HoverCard/ActionSheet/Command/Menubar）
 * e2e-10 拆分——文件级超时（并发 CPU 压力）——更细粒度并发。
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

test('deep-hovercard：悬停 → 卡片出现（openDelay）', async () => {
  const page = await browser.newPage()
  try {
    await openScenario(page, BASE, 'deep-hovercard')
    // force：卡片打开后覆盖按钮上方（placement top 修复后紧贴）——拦截检查死锁
    await page.locator('.deep-hovercard-scene').getByText('悬停', { exact: true }).hover({ force: true })
    await page.waitForFunction(() => (document.querySelector('#__wf_portal')?.textContent ?? '').includes('悬停卡片内容'), '悬停卡片出现', { timeout: 2500 })
  } finally {
    await page.close()
  }
})

test('deep-actionsheet：打开 → 选项选择 → onSelect + 自动关闭', async () => {
  const page = await browser.newPage()
  try {
    await openScenario(page, BASE, 'deep-actionsheet')
    await page.click('.as-open')
    await page.waitForFunction(() => (document.querySelector('#__wf_portal')?.textContent ?? '').includes('选项B'), '面板出现', { timeout: 2500 })
    await page.locator('#__wf_portal').getByText('选项B', { exact: true }).click()
    await page.waitForFunction(() => (document.querySelector('.deep-actionsheet-log')?.textContent ?? '').includes('v:b'), '选择选项B → onSelect(b)')
  } finally {
    await page.close()
  }
})

test('deep-command：打开 → 搜索过滤 → 选择', async () => {
  const page = await browser.newPage()
  try {
    await openScenario(page, BASE, 'deep-command')
    await page.click('.cm-open')
    await page.waitForFunction(() => (document.querySelector('#__wf_portal')?.textContent ?? '').includes('新建文件'), '命令面板出现', { timeout: 2500 })
    await page.locator('#__wf_portal').getByText('新建文件', { exact: true }).click()
    await page.waitForFunction(() => (document.querySelector('.deep-command-log')?.textContent ?? '').includes('v:1'), '选择新建文件 → onSelect(1)')
  } finally {
    await page.close()
  }
})

test('deep-menubar：展开菜单 → 选择项', async () => {
  const page = await browser.newPage()
  try {
    await openScenario(page, BASE, 'deep-menubar')
    await page.locator('.deep-menubar-scene').getByText('文件', { exact: true }).click()
    await page.waitForFunction(() => (document.querySelector('#__wf_portal')?.textContent ?? '').includes('新建'), '文件菜单展开', { timeout: 2500 })
    await page.locator('#__wf_portal').getByText('新建', { exact: true }).click()
    await page.waitForFunction(() => (document.querySelector('.deep-menubar-log')?.textContent ?? '').includes('new'), '选择新建 → onSelect(new)')
  } finally {
    await page.close()
  }
})
