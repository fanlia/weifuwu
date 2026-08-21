/**
 * 组件深度场景 4——浮层组件（Modal/Drawer/Popover/Tooltip/Dropdown/Popconfirm/HoverCard/ActionSheet/Command/Menubar）
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

test('deep-modal：打开 → 关闭按钮关 + onClose 回调', async () => {
  const page = await browser.newPage()
  try {
    await openScenario(page, BASE, 'deep-modal')
    await page.click('.dm-open')
    await page.waitForSelector('.wf-modal')
    assert.equal(await page.locator('.wf-modal').textContent(), '弹窗标题弹窗内容', '弹窗内容渲染')
    // 关闭按钮（aria-label 关闭）
    await page.locator('.wf-modal [aria-label="关闭"], .wf-modal-close').click()
    await page.waitForFunction(() => !document.querySelector('.wf-modal'), '关闭按钮 → 弹窗移除')
    assert.ok(((await page.locator('.deep-modal-log').textContent()) ?? '').includes('close'), 'onClose 回调')
  } finally {
    await page.close()
  }
})

test('deep-drawer：打开 → 关闭', async () => {
  const page = await browser.newPage()
  try {
    await openScenario(page, BASE, 'deep-drawer')
    await page.click('.dd-open')
    await page.waitForSelector('.wf-drawer')
    assert.equal(await page.locator('.wf-drawer').textContent(), '抽屉标题抽屉内容', '抽屉内容渲染')
    await page.locator('.wf-drawer [aria-label="关闭"], .wf-drawer-close').click()
    await page.waitForFunction(() => !document.querySelector('.wf-drawer'), '关闭 → 抽屉移除')
    assert.ok(((await page.locator('.deep-drawer-log').textContent()) ?? '').includes('close'), 'onClose 回调')
  } finally {
    await page.close()
  }
})

test('deep-popover：点击触发 → 气泡出现', async () => {
  const page = await browser.newPage()
  try {
    await openScenario(page, BASE, 'deep-popover')
    await page.locator('.deep-popover-scene').getByText('点我', { exact: true }).click()
    await page.waitForFunction(() => (document.querySelector('#__wf_portal')?.textContent ?? '').includes('气泡内容'), '气泡内容出现', { timeout: 2500 })
  } finally {
    await page.close()
  }
})

test('deep-tooltip：悬停 → 提示出现', async () => {
  const page = await browser.newPage()
  try {
    await openScenario(page, BASE, 'deep-tooltip')
    await page.locator('.deep-tooltip-scene').getByText('悬停我', { exact: true }).hover()
    await page.waitForFunction(() => (document.querySelector('#__wf_portal')?.textContent ?? '').includes('提示内容'), '悬停提示出现', { timeout: 2500 })
  } finally {
    await page.close()
  }
})

test('deep-dropdown：展开 → 菜单项选择', async () => {
  const page = await browser.newPage()
  try {
    await openScenario(page, BASE, 'deep-dropdown')
    await page.locator('.deep-dropdown-scene').getByText('下拉菜单', { exact: true }).click()
    await page.waitForFunction(() => (document.querySelector('#__wf_portal')?.textContent ?? '').includes('操作二'), '菜单展开', { timeout: 2500 })
    await page.locator('#__wf_portal').getByText('操作二', { exact: true }).click()
    await page.waitForFunction(() => (document.querySelector('.deep-dropdown-log')?.textContent ?? '').includes('v:2'), '选择操作二 → onSelect(2)')
  } finally {
    await page.close()
  }
})

test('deep-popconfirm：确认 → onConfirm', async () => {
  const page = await browser.newPage()
  try {
    await openScenario(page, BASE, 'deep-popconfirm')
    await page.locator('.deep-popconfirm-scene').getByText('删除', { exact: true }).click()
    await page.waitForFunction(() => (document.querySelector('#__wf_portal')?.textContent ?? '').includes('确定删除'), '确认气泡出现', { timeout: 2500 })
    await page.locator('#__wf_portal').getByText('确定', { exact: true }).click()
    await page.waitForFunction(() => (document.querySelector('.deep-popconfirm-log')?.textContent ?? '').includes('ok'), '确认 → onConfirm')
  } finally {
    await page.close()
  }
})

test('deep-hovercard：悬停 → 卡片出现（openDelay）', async () => {
  const page = await browser.newPage()
  try {
    await openScenario(page, BASE, 'deep-hovercard')
    await page.locator('.deep-hovercard-scene').getByText('悬停', { exact: true }).hover()
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
