/**
 * showcase 组件测试——FileUpload（/components/fileupload）——全功能点固化
 * 清单：「FileUpload」组（playwright 实测后固化）
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-fileupload.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/fileupload'

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

test('FP1 文件选择：列表回流（多文件）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main input[type="file"]', { state: 'attached' })
    await page.locator('main input[type="file"]').first().setInputFiles([
      { name: 'test.png', mimeType: 'image/png', buffer: Buffer.from('fakepng') },
      { name: 'doc.pdf', mimeType: 'application/pdf', buffer: Buffer.from('fakepdf') },
    ])
    await page.waitForFunction(() => (document.querySelector('main')?.textContent ?? '').includes('test.png'), null, { timeout: 3000 })
    const t = await page.evaluate(() => document.querySelector('main')?.textContent ?? '')
    assert.ok(t.includes('doc.pdf'), '第二文件')
  } finally { await page.close() }
})

test('FP2 maxSize 超限拒绝（>5MB → 错误提示）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main input[type="file"]', { state: 'attached' })
    const bigBuf = Buffer.alloc(6 * 1024 * 1024, 'x')
    await page.locator('main input[type="file"]').first().setInputFiles([{ name: 'big.bin', mimeType: 'application/octet-stream', buffer: bigBuf }])
    await page.waitForTimeout(400)
    const t = await page.evaluate(() => document.querySelector('main')?.textContent ?? '')
    assert.ok(t.includes('最大') || t.includes('超') || !t.includes('big.bin'), '大文件被拒')
  } finally { await page.close() }
})

test('FP3 上传进度（父层驱动）：progressbar aria-valuenow 动态变化', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main input[type="file"]', { state: 'attached' })
    await page.locator('main input[type="file"]').first().setInputFiles([{ name: 'p.png', mimeType: 'image/png', buffer: Buffer.from('x') }])
    await page.waitForTimeout(300)
    await page.locator('main button', { hasText: '模拟上传（进度）' }).first().click()
    await page.waitForFunction(() => {
      const v = document.querySelector('main [role="progressbar"]')?.getAttribute('aria-valuenow')
      return v && parseInt(v) > 0
    }, null, { timeout: 3000 })
  } finally { await page.close() }
})
