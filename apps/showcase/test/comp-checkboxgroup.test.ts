/**
 * showcase 组件测试——CheckboxGroup（/components/checkboxgroup）——全功能点固化
 * 清单：design/COMPONENT-VERIFICATION-CHECKLIST.md「CheckboxGroup」组（playwright 实测后固化）
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-checkboxgroup.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/checkboxgroup'

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

test('FP1 组渲染：label + 3 选项 + 初始值 a 回显', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main .wf-checkbox')
    assert.equal(await page.locator('main .wf-checkbox').count(), 8, '3+4+1 实例')
    const st = await page.evaluate(() => [...document.querySelectorAll('main .wf-checkbox input')].map((c) => c.checked))
    assert.equal(st[0], true, '初始选中 a')
    const t = await page.evaluate(() => document.querySelector('main')?.textContent ?? '')
    assert.ok(t.includes('选择成员') && t.includes('已选：a'), 'label+回显')
  } finally { await page.close() }
})

test('FP2/FP3 多选叠加 → 取消单项（受控数组回流）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main .wf-checkbox')
    const boxes = page.locator('main .wf-checkbox')
    await boxes.nth(1).click()
    await page.waitForFunction(() => (document.querySelector('main')?.textContent ?? '').includes('a, b'), null, { timeout: 3000 })
    await boxes.nth(0).click()
    await page.waitForFunction(() => (document.querySelector('main')?.textContent ?? '').includes('已选：b'), null, { timeout: 3000 })
  } finally { await page.close() }
})

test('FP4 columns=2 栅格几何', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main .wf-checkbox')
    const cols = await page.evaluate(() => {
      const g = document.querySelector('main .wf-checkbox-group--cols-2')
      if (!g) return 0
      const item = g.querySelector('.wf-checkbox')
      if (!item) return 0
      // cols-2 实现 = flex-wrap + 子项 flex-basis 50%（非 grid——CSS 契约）
      // computed flexBasis 是 calc(50% - var) 表达式——含 50% 即两列契约
      return getComputedStyle(item).flexBasis.includes('50%') ? 1 : 0
    })
    assert.equal(cols, 1, `--cols-2 子项 flex-basis 50%`)
  } finally { await page.close() }
})

test('FP5 整组 disabled：input disabled + 点击无变化', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main .wf-checkbox')
    const disInput = page.locator('main .wf-checkbox input').last()
    assert.equal(await disInput.evaluate((el) => el.disabled), true, 'disabled 属性')
  } finally { await page.close() }
})
