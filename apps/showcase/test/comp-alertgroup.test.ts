/**
 * showcase 组件测试——AlertGroup（/components/AlertGroup）——全功能点固化
 * 清单：「AlertGroup」组（playwright 实测后固化）
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-alertgroup.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/alertgroup'

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
  await page.waitForSelector('main .wf-alertgroup')
}

test('FP1 折叠语义（≥3 条 → +N）+ 点击展开全量', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    // demo 4 条 → 默认折叠：只显示 1 条 + "+4 条通知"
    const t0 = await page.evaluate(() => document.querySelector('main')?.textContent ?? '')
    assert.ok(t0.includes('+4 条通知'), '折叠徽标 "+4 条通知"')
    assert.ok(t0.includes('服务 A 重启完成'), '首条可见')
    assert.ok(!t0.includes('服务 D 重启完成'), '折叠态其余不可见')
    // 点击展开
    await page.evaluate(() => {
      const el = [...document.querySelectorAll('main *')].find((e) => (e.textContent ?? '').trim().startsWith('+4 条通知') && (e.textContent ?? '').trim().length < 12)
      ;(el?.closest('button') ?? el)?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await page.waitForFunction(() => {
      const t = document.querySelector('main')?.textContent ?? ''
      return ['服务 A 重启完成', '服务 B 发布成功', '服务 C 容量告警', '服务 D 重启完成'].every((m) => t.includes(m))
    }, null, { timeout: 3000 })
    const t1 = await page.evaluate(() => document.querySelector('main')?.textContent ?? '')
    assert.ok(t1.includes('10:01') && t1.includes('10:04'), 'time 字段渲染')
  } finally { await page.close() }
})

test('FP1b variant 语义类（warning 折叠徽标态）+ FP2 onClose 受控', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    // 折叠态 warning item 未渲染——先展开再断言变体类
    await page.evaluate(() => {
      const el = [...document.querySelectorAll('main *')].find((e) => (e.textContent ?? '').trim().startsWith('+4 条通知') && (e.textContent ?? '').trim().length < 12)
      ;(el?.closest('button') ?? el)?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await page.waitForFunction(() => (document.querySelector('main')?.textContent ?? '').includes('服务 C 容量告警'), null, { timeout: 3000 })
    const warnCls = await page.evaluate(() => [...document.querySelectorAll('main [class*="alert"]')].some((el) => (el.className || '').includes('warning')))
    assert.ok(warnCls, 'warning 变体类（展开后）')
    // demo 未传 onClose → 无关闭按钮（读源：onClose && 才渲染——受控语义）
    const closeBtns = await page.evaluate(() => document.querySelectorAll('main .wf-alertgroup-close').length)
    assert.equal(closeBtns, 0, 'onClose 未传 → 无关闭按钮')
  } finally { await page.close() }
})

