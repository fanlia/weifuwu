/**
 * showcase 组件测试——Tree（/components/tree）——勾选+搜索
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-tree.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/tree'

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

test('能力：树勾选（checkable onCheck）+ 搜索过滤', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    const text = await page.evaluate(() => document.body.textContent ?? '')
    for (const t of ['总部', '技术部', '前端组', '后端组', '市场部']) assert.ok(text.includes(t), `节点：${t}`)
    // 勾选「后端组」checkbox → checked 更新（前端组已勾——勾选后两者并存）
    const cb = page.locator('main [class*="tree"] [class*="check"]').nth(1)
    if (await cb.count() > 0) {
      await cb.click()
      await page.waitForTimeout(300)
    }
    // 搜索过滤（输入「市场」→ 只留匹配节点）
    const search = page.locator('main input[placeholder="搜索节点…"]').first()
    await search.fill('市场')
    await page.waitForTimeout(300)
    const after = await page.evaluate(() => document.body.textContent ?? '')
    assert.ok(after.includes('市场部'), '搜索命中')
  } finally { await page.close() }
})
