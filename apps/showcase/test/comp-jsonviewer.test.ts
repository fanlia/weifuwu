/**
 * showcase 组件测试——JSONViewer（/components/jsonviewer）——全功能点固化
 * 清单：design/COMPONENT-VERIFICATION-CHECKLIST.md「JSONViewer」组（playwright 实测后固化）
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-jsonviewer.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/jsonviewer'

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

test('FP1/FP2 类型色类 + 深层折叠（默认展开深度 2）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main [class*="wf-json-"]')
    const cls = await page.evaluate(() => [...new Set([...document.querySelectorAll('main [class*="wf-json-"]')].flatMap((e) => [...e.classList]).filter((c) => /string|number|boolean/.test(c)))])
    assert.ok(cls.length >= 3, `类型色 ${cls.join(',')}`)
    assert.ok(await page.evaluate(() => document.querySelectorAll('main [class*="collapse"]').length >= 1), '深层折叠')
    const t = await page.evaluate(() => document.querySelector('main')?.textContent ?? '')
    assert.ok(t.includes('agent_42') && !t.includes('pending'), '浅层可见/深层收起')
  } finally { await page.close() }
})

test('FP3 递归展开：逐层点击 → depth3 键值可见', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main [class*="wf-json-"]')
    for (let round = 0; round < 4; round++) {
      await page.evaluate(() => [...document.querySelectorAll('main [class*="collapse"]')].forEach((e) => (e).click()))
      await page.waitForTimeout(200)
    }
    const t = await page.evaluate(() => document.querySelector('main')?.textContent ?? '')
    assert.ok(t.includes('pending') && t.includes('u_7'), '深层键值展开')
  } finally { await page.close() }
})
