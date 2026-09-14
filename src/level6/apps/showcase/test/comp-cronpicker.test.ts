/**
 * showcase 组件测试——CronPicker（/components/cronpicker）——全功能点固化
 * 清单：preset 选中 → 当前值变更 · 自由输入直传 · 双通道共存
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-cronpicker.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/cronpicker'

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

test('FP1 首帧：preset 匹配 → 当前值显示默认档（*/5）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main input')
    const val = await page.evaluate(() => (document.querySelector('main input') as HTMLInputElement)?.value ?? '')
    assert.equal(val, '*/5 * * * *', 'Demo 初值 = 每 5 分钟')
  } finally { await page.close() }
})

test('FP2 preset 选中 → 当前值同步', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main select')
    await page.selectOption('main select', '0 9 * * *')
    await page.waitForTimeout(150)
    const val = await page.evaluate(() => (document.querySelector('main input') as HTMLInputElement)?.value ?? '')
    assert.equal(val, '0 9 * * *', 'preset 联动自由输入')
  } finally { await page.close() }
})

test('FP3 自由输入直传（非 preset 值保留）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main input')
    await page.fill('main input', '0 2 * * 6')
    await page.waitForTimeout(150)
    const val = await page.evaluate(() => (document.querySelector('main input') as HTMLInputElement)?.value ?? '')
    assert.equal(val, '0 2 * * 6', '自由输入直传')
  } finally { await page.close() }
})
