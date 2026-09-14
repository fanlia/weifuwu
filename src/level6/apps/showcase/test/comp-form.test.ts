/**
 * showcase 组件测试——Form（/components/form）——全功能点固化
 * 清单：「Form」组（playwright 实测后固化）
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-form.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/form'

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

test('FP1 空提交 → validation 拦截 + onError 双错误文案', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main button')
    await page.locator('main button', { hasText: '提交表单' }).first().click()
    await page.waitForFunction(() => {
      const t = document.querySelector('main')?.textContent ?? ''
      return t.includes('请输入用户名') && t.includes('请输入有效邮箱')
    }, null, { timeout: 3000 })
  } finally { await page.close() }
})

test('FP2 合法值提交 → onSubmit → 成功 Alert', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main input[name="username"]')
    await page.locator('main input[name="username"]').first().fill('xiaoma')
    await page.locator('main input[name="email"]').first().fill('x@y.com')
    await page.locator('main button', { hasText: '提交表单' }).first().click()
    await page.waitForFunction(() => (document.querySelector('main')?.textContent ?? '').includes('表单已提交'), null, { timeout: 3000 })
  } finally { await page.close() }
})

test('FP3 pattern 规则：非法邮箱仍拦截', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main input[name="username"]')
    await page.locator('main input[name="username"]').first().fill('xiaoma')
    await page.locator('main input[name="email"]').first().fill('bad-input')
    await page.locator('main button', { hasText: '提交表单' }).first().click()
    await page.waitForFunction(() => (document.querySelector('main')?.textContent ?? '').includes('请输入有效邮箱'), null, { timeout: 3000 })
  } finally { await page.close() }
})
