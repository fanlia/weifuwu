/**
 * showcase 组件测试——Popconfirm（/components/popconfirm）——全功能点固化
 * 清单：「Popconfirm」组（playwright 实测后固化）
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-popconfirm.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, assertPopupGeometry, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/popconfirm'

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

test('FP1/FP2 danger 气泡 + 确认 → onConfirm toast', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main button')
    await page.locator('main button', { hasText: '删除' }).first().click()
    await page.waitForFunction(() => (document.querySelector('#__wf_portal')?.textContent ?? '').includes('确定删除这条数据'), null, { timeout: 3000 })
    await page.locator('#__wf_portal button').filter({ hasText: /确定|删除/ }).last().click()
    await page.waitForFunction(() => (document.body.textContent ?? '').includes('已删除'), null, { timeout: 3000 })
  } finally { await page.close() }
})

test('FP3 取消 → onCancel 关闭气泡', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main button')
    await page.locator('main button', { hasText: '提交' }).first().click()
    await page.waitForFunction(() => (document.querySelector('#__wf_portal')?.textContent ?? '').includes('确定提交审核'), null, { timeout: 3000 })
    await page.locator('#__wf_portal button').filter({ hasText: /取消/ }).first().click()
    await page.waitForFunction(() => !(document.querySelector('#__wf_portal')?.textContent ?? '').includes('确定提交审核'), null, { timeout: 3000 })
  } finally { await page.close() }
})

test('位置：portal 归属 + fixed + 视口内 + 确认气泡 top', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.locator('main .wf-surface button', { hasText: '删除' }).first().click()
    await assertPopupGeometry(page, { panelText: '确定', anchorText: '删除', dir: 'top', centerAxis: 'x', transformNone: true })
  } finally { await page.close() }
})
