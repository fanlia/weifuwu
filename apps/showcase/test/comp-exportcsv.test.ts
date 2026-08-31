/**
 * showcase 组件测试——ExportCSV（/components/exportcsv）——全功能点固化
 * 清单：design/COMPONENT-VERIFICATION-CHECKLIST.md「ExportCSV」组（playwright 实测后固化）
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-exportcsv.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/exportcsv'

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

test('FP1 导出下载：文件头（列 label）+ 数据行 + BOM（Excel 兼容）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main button')
    const dlPromise = page.waitForEvent('download', { timeout: 5000 })
    await page.locator('main button', { hasText: '导出 CSV' }).first().click()
    const dl = await dlPromise
    const fs = await import('node:fs')
    const content = fs.readFileSync(await dl.path(), 'utf8')
    assert.ok(content.includes('ID,客户,金额'), `表头 ${JSON.stringify(content.slice(0, 20))}`)
    assert.ok(content.includes('张伟') && content.includes('1280'), '数据行')
  } finally { await page.close() }
})
