/**
 * showcase 组件测试——Math（/components/math）——全功能点固化
 * 清单：design/COMPONENT-VERIFICATION-CHECKLIST.md「Math」组（playwright 实测后固化）
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-math.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/math'

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

test('FP1 LaTeX 渲染：分数/求和/希腊字母（数学节点面）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main [class*="math"]')
    const info = await page.evaluate(() => {
      const t = document.querySelector('main')?.textContent ?? ''
      return {
        sigma: t.includes('∑') || t.includes('Σ'),
        greek: t.includes('α') || t.includes('β'),
        nodes: document.querySelectorAll('main [class*="math"]').length,
      }
    })
    assert.ok(info.sigma && info.greek, '求和+希腊')
    assert.ok(info.nodes >= 20, `数学节点 ${info.nodes}`)
  } finally { await page.close() }
})
