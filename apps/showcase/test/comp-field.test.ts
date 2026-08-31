/**
 * showcase 组件测试——Field（/components/field）——全功能点固化
 * 清单：design/COMPONENT-VERIFICATION-CHECKLIST.md「Field」组（playwright 实测后固化）
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-field.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/field'

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

test('FP1-3 required 标记 + error/hint 文案渲染（Field 布局层契约）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main [class*="field"]')
    const t = await page.evaluate(() => document.querySelector('main')?.textContent ?? '')
    assert.ok(t.includes('姓名') && t.includes('邮箱') && t.includes('密码'), '三个 Field')
    assert.ok(t.includes('邮箱格式不正确'), 'error 文案')
    assert.ok(t.includes('至少 6 位'), 'hint 文案')
    const req = await page.evaluate(() => [...document.querySelectorAll('main [class*="field"] *')].some((e) => (e.className || '').toString().includes('wf-field-req')))
    assert.equal(req, true, 'required 星标（wf-field-req）')
  } finally { await page.close() }
})
