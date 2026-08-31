/**
 * showcase 组件测试——Input（/components/input）——全功能点固化
 * 清单：design/COMPONENT-VERIFICATION-CHECKLIST.md「Input」组（playwright 实测后固化）
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-input.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/input'

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

test('FP1-3 受控回流 + type=password + error/hint 文案', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main .wf-input')
    const first = page.locator('main .wf-input').first()
    await first.fill('修改后')
    await page.waitForFunction(() => document.querySelector('main .wf-input')?.value === '修改后', null, { timeout: 3000 })
    assert.ok(await page.locator('main input[type="password"]').count() >= 1, 'password')
    const t = await page.evaluate(() => document.querySelector('main')?.textContent ?? '')
    assert.ok(t.includes('请输入有效内容') && t.includes('只能包含字母和数字'), 'error+hint')
  } finally { await page.close() }
})
