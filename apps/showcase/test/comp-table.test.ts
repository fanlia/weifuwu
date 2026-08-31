/**
 * showcase 组件测试——Table（/components/table）——完整能力
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-table.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/table'

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

test('渲染零错误 + 3 行数据（列头/姓名/角色/状态 Badge）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    const text = await page.evaluate(() => document.body.textContent ?? '')
    for (const t of ['姓名', '角色', '状态', '张三', '李四', '王五', '管理员']) assert.ok(text.includes(t), `渲染：${t}`)
  } finally { await page.close() }
})

test('能力：排序（onSort——点「姓名」列头切换 asc/desc）+ 空态切换', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    // 点列头排序（姓名——sortable）
    await page.locator('main [class*="table"] th, main [class*="table"] [class*="header"]', { hasText: '姓名' }).first().click()
    await page.waitForTimeout(300)
    const sortState = await page.evaluate(() => {
      const th = Array.from(document.querySelectorAll('main [class*="table"] th, main [class*="table"] [class*="header"]')).find((x) => x.textContent?.includes('姓名'))
      return th ? th.className : ''
    })
    assert.ok(sortState.includes('asc') || sortState.includes('desc') || sortState.includes('sort'), `排序状态（实际 ${sortState.slice(0, 40)}）`)
    // 空态切换
    await page.locator('main .wf-surface button', { hasText: '空态' }).first().click()
    await page.waitForFunction(() => (document.body.textContent ?? '').includes('暂无数据'), '空态', { timeout: 3000 })
    // 回有数据
    await page.locator('main .wf-surface button', { hasText: '有数据' }).first().click()
    await page.waitForFunction(() => (document.body.textContent ?? '').includes('张三'), '数据恢复', { timeout: 3000 })
  } finally { await page.close() }
})
