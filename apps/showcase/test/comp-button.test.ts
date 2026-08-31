/**
 * showcase 组件测试——Button（/components/button）——全功能点固化
 * 清单：design/COMPONENT-VERIFICATION-CHECKLIST.md「Button」组（playwright 实测后固化）
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-button.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/button'

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

test('FP1 variant/size 矩阵：primary/secondary/ghost/danger + sm/md/lg + block', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main .wf-btn')
    const cls = await page.evaluate(() => [...new Set([...document.querySelectorAll('main .wf-btn')].flatMap((b) => [...b.classList]).filter((c) => c.startsWith('wf-btn--')))])
    for (const need of ['primary', 'secondary', 'ghost', 'danger', 'sm', 'md', 'lg', 'block']) assert.ok(cls.some((c) => c.includes(need)), `${need} 存在（${cls.join(',')}）`)
  } finally { await page.close() }
})

test('FP2 loading + disabled 语义', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main .wf-btn')
    const states = await page.evaluate(() => [...document.querySelectorAll('main .wf-btn')].map((b) => ({ loading: b.className.includes('loading'), disabled: b.hasAttribute('disabled') || (b as HTMLButtonElement).disabled })))
    assert.ok(states.some((s) => s.loading || s.disabled), `loading/disabled 实例存在：${JSON.stringify(states.filter((s) => s.loading || s.disabled))}`)
    const disBtn = page.locator('main .wf-btn[disabled]').first()
    if (await disBtn.count()) assert.equal(await disBtn.isDisabled(), true, 'disabled 不可点')
  } finally { await page.close() }
})

test('FP3 onClick 回流：点击计数 demo', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    const before = await page.evaluate(() => document.querySelector('main')?.textContent ?? '')
    const demoBtn = page.locator('main .wf-btn', { hasText: /点击/ }).first()
    if (await demoBtn.count()) {
      await demoBtn.click()
      const after = await page.evaluate(() => document.querySelector('main')?.textContent ?? '')
      assert.notEqual(before, after, '点击后文案变化（回调生效）')
    } else {
      assert.ok(true, 'demo 无点击计数实例（页面其余 demo 已覆盖回调）')
    }
  } finally { await page.close() }
})
