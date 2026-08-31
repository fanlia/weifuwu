/**
 * showcase 组件测试——AuthPage（/components/authpage）——全功能点固化
 * 清单：design/COMPONENT-VERIFICATION-CHECKLIST.md「AuthPage」组（playwright 实测后固化）
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-authpage.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/authpage'

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

test('FP1/FP2 渲染基线：title/subtitle + children 表单字段', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    const t = await page.evaluate(() => document.querySelector('main')?.textContent ?? '')
    assert.ok(t.includes('登录') && t.includes('多租户 AI 平台'), 'title/subtitle')
    assert.ok(t.includes('邮箱') && t.includes('密码'), 'children 字段（邮箱/密码）')
  } finally { await page.close() }
})

test('FP3 footer 切换链接：title/submitLabel/footer 联动（登录↔注册）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.locator('main a', { hasText: '立即注册' }).first().click()
    await page.waitForFunction(() => {
      const t = document.querySelector('main')?.textContent ?? ''
      return t.includes('创建账号') && t.includes('注 册') && t.includes('已有账号？')
    }, null, { timeout: 3000 })
  } finally { await page.close() }
})

test('FP4/FP5 onSubmit → loading 禁用 → error 错误条（demo 模拟网络错误）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.locator('main a', { hasText: '立即注册' }).first().click()
    const btn = page.locator('main button', { hasText: '注 册' }).last()
    await btn.click()
    await page.waitForFunction(() => {
      const btns = [...document.querySelectorAll('main button')].map((b) => ({ t: b.textContent, d: (b as HTMLButtonElement).disabled }))
      return btns.some((b) => (b.t ?? '').includes('加载中') && b.d)
    }, null, { timeout: 3000 })
    // 800ms 后 demo 模拟网络错误 → 错误条
    await page.waitForFunction(() => (document.querySelector('main')?.textContent ?? '').includes('网络错误（模拟）'), null, { timeout: 3000 })
    // 清除错误
    await page.locator('main button', { hasText: '清除错误' }).first().click()
    await page.waitForFunction(() => !(document.querySelector('main')?.textContent ?? '').includes('网络错误（模拟）'), null, { timeout: 3000 })
  } finally { await page.close() }
})
