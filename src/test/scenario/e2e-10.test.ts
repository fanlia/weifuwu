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

test('deep-tooltip：悬停 → 提示出现 + 4 方向位置语义（函数 placement 渲染期解析）', async () => {
  const page = await browser.newPage()
  try {
    await openScenario(page, BASE, 'deep-tooltip')
    const tips: [string, string][] = [['top', '上提示'], ['bottom', '下提示'], ['left', '左提示'], ['right', '右提示']]
    for (const [dir, text] of tips) {
      const btn = page.locator(`.deep-tip-btn[data-tip="${dir}"]`)
      await btn.hover()
      await page.waitForFunction((t) => (document.querySelector('#__wf_portal')?.textContent ?? '').includes(t), text, { timeout: 2500 })
      // 几何语义：面板与锚点 rect 相对关系（top=面板在锚点上方 / bottom=下方 / left=左侧 / right=右侧）
      // 面板切换竞态（上/下按钮相邻——旧面板关闭中）→ 轮询等位置稳定
      let ok = false
      for (let i = 0; i < 30; i++) {
        ok = await page.evaluate(({ dir, text }) => {
          const tipEl = Array.from(document.querySelectorAll('.wf-tooltip-content')).find((e) => e.textContent?.includes(text))
          if (!tipEl) return false
          const panel = tipEl.parentElement
          if (!panel) return false
          const pr = panel.getBoundingClientRect()
          if (pr.width === 0 || pr.height === 0) return false
          const btn = document.querySelector(`.deep-tip-btn[data-tip="${dir}"]`)
          if (!btn) return false
          const br = btn.getBoundingClientRect()
          return dir === 'top' ? pr.bottom < br.top : dir === 'bottom' ? pr.top > br.bottom : dir === 'left' ? pr.right < br.left : pr.left > br.right
        }, { dir, text })
        if (ok) break
        await page.waitForTimeout(100)
      }
      assert.ok(ok, `${dir} 方向位置语义`)
      await page.mouse.move(700, 600)
      await page.waitForTimeout(250)
    }
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
    await page.waitForFunction(() => (document.querySelector('#__wf_portal')?.textContent ?? '').includes('确定删除'), '确认气泡出现', { timeout: 5000 })
    // eval 点击确定（locator.click 在 fixed 面板上偶发浏览器崩溃——环境）
    await page.evaluate(() => {
      const ok = Array.from(document.querySelectorAll('#__wf_portal button')).find((b) => b.textContent?.trim() === '确定')
      if (ok) ok.click()
    })
    await page.waitForFunction(() => (document.querySelector('.deep-popconfirm-log')?.textContent ?? '').includes('ok'), '确认 → onConfirm')
  } finally {
    await page.close()
  }
})
