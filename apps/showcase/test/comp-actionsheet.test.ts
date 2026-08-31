/**
 * showcase 组件测试——ActionSheet（/components/actionsheet）——完整能力
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-actionsheet.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, assertPopupGeometry, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/actionsheet'

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

/** evaluate 轮询（组件页文档表格样式循环——rAF/定时器饿死规避） */
async function waitFor(page: import('playwright').Page, fn: () => Promise<boolean>, msg: string, timeoutMs = 5000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await page.evaluate(fn)) return
    await page.waitForTimeout(100)
  }
  throw new Error(`${msg} 超时`)
}

test('渲染零错误 + 打开 + 选项选择（删除——danger——选择结果）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.locator('main .wf-surface button', { hasText: '选择操作' }).first().click()
    await waitFor(page, () => Promise.resolve((document.body.textContent ?? '').includes('拍照')), '操作表')
    assert.ok(await page.evaluate(() => (document.body.textContent ?? '').includes('从相册选择')), '选项')
    // 选「删除」→ onSelect（选择结果: delete）
    await page.locator('#__wf_portal button, .wf-popup button', { hasText: '删除' }).first().click()
    await waitFor(page, () => Promise.resolve((document.body.textContent ?? '').includes('选择结果：delete')), '选择回调')
  } finally { await page.close() }
})
test('清理：选择后关闭 → portal 零残留（卸载语义）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.locator('main .wf-surface button').first().click()
    await waitFor(page, () => Promise.resolve(!!document.querySelector('#__wf_portal [class*="actionsheet"], #__wf_portal [class*="sheet"]')), '面板出现')
    await page.locator('#__wf_portal button', { hasText: '删除' }).first().click()
    await waitFor(page, () => Promise.resolve(!document.querySelector('#__wf_portal [class*="actionsheet"], #__wf_portal [class*="sheet"]')), '选择后关闭')
    assert.equal(await page.locator('#__wf_portal [class*="actionsheet"], #__wf_portal [class*="sheet"]').count(), 0, 'portal 零残留')
  } finally { await page.close() }
})

test('位置：portal 归属 + fixed + 视口内 + 底部面板', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    
    await page.locator('main .wf-surface button', { hasText: '选择操作' }).first().click()
    await assertPopupGeometry(page, { panelText: '删除' })
  } finally { await page.close() }
})
