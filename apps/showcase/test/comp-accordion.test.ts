/**
 * showcase 组件测试——Accordion（/components/accordion）——全功能点固化
 * 清单：design/COMPONENT-VERIFICATION-CHECKLIST.md「Accordion」组（playwright 实测后固化）
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-accordion.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/accordion'

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
  await page.waitForSelector('main .wf-accordion')
}

test('FP1/FP2 渲染基线 + items 数据面：3 面板 title/content 渲染', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    const panels = page.locator('main .wf-accordion').first().locator('.wf-accordion-item')
    assert.equal(await panels.count(), 3, '3 面板')
    const text = await page.evaluate(() => document.querySelector('main')!.textContent ?? '')
    for (const t of ['什么是 weifuwu？', '如何安装？', 'npm install weifuwu']) assert.ok(text.includes(t), `title/content：${t}`)
  } finally { await page.close() }
})

test('FP3 非受控默认全展开：无 active 时内部态 = 全部 keys', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    const openCount = await page.locator('main .wf-accordion').first().locator('.wf-accordion-item--open').count()
    assert.equal(openCount, 3, '3 项全展开')
  } finally { await page.close() }
})

test('FP4 互斥展开（multiple=false 默认）：点已展开项收起 → 点新项互斥展开', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    const acc = page.locator('main .wf-accordion').first()
    const sumB = acc.locator('.wf-accordion-summary', { hasText: '如何安装' })
    // 点已展开项 → 收起（3-1=2）——scoping 到第一个实例（页面另有 multiple/受控 demo 实例）
    await sumB.click()
    await page.waitForFunction(() => {
      const acc = document.querySelectorAll('main .wf-accordion')[0]
      return acc && acc.querySelectorAll('.wf-accordion-item--open').length === 2
    }, null, { timeout: 3000 })
    assert.equal(await sumB.getAttribute('aria-expanded'), 'false', 'B 收起后 aria-expanded=false')
    // 点 A（已收）→ 互斥展开：仅 A open（=1）——B 保持收起
    await acc.locator('.wf-accordion-summary', { hasText: '什么是 weifuwu' }).click()
    await page.waitForFunction(() => {
      const acc = document.querySelectorAll('main .wf-accordion')[0]
      return acc && acc.querySelectorAll('.wf-accordion-item--open').length === 1
    }, null, { timeout: 3000 })
    assert.equal(await sumB.getAttribute('aria-expanded'), 'false', '互斥后 B 保持 false')
    // 互斥展开腿：从仅 C 开 → 点收起的 A → setActive([a])——C 收起、A 展开
    const sumC = acc.locator('.wf-accordion-summary', { hasText: '组件库包含什么' })
    await acc.locator('.wf-accordion-summary', { hasText: '什么是 weifuwu' }).click()
    await page.waitForFunction(() => {
      const acc = document.querySelectorAll('main .wf-accordion')[0]
      const sums = acc?.querySelectorAll('.wf-accordion-summary') ?? []
      return sums[0]?.getAttribute('aria-expanded') === 'true' && sums[2]?.getAttribute('aria-expanded') === 'false'
    }, null, { timeout: 3000 })
    assert.equal(await sumC.getAttribute('aria-expanded'), 'false', '互斥展开后 C 被收起')
  } finally { await page.close() }
})

test('FP5 multiple 多开：A、B 同时展开（初始全展开 → 先收两项再分别展开）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    const acc = page.locator('main .wf-accordion').nth(1)
    const sumA = acc.locator('.wf-accordion-summary', { hasText: '多开 A' })
    const sumB = acc.locator('.wf-accordion-summary', { hasText: '多开 B' })
    // 初始全展开 → 点 A、B 收起（禁用项 m3 不可收——保持 open=1）
    await sumA.click()
    await sumB.click()
    await page.waitForFunction(() => {
      const acc = document.querySelectorAll('main .wf-accordion')[1]
      return acc && acc.querySelectorAll('.wf-accordion-item--open').length === 1
    }, null, { timeout: 3000 })
    // 再开 A、B → multiple 语义：同时展开
    await sumA.click()
    await sumB.click()
    await page.waitForFunction(() => {
      const acc = document.querySelectorAll('main .wf-accordion')[1]
      const a = acc?.querySelectorAll('.wf-accordion-summary')[0] as HTMLElement | null
      const b = acc?.querySelectorAll('.wf-accordion-summary')[1] as HTMLElement | null
      return a?.getAttribute('aria-expanded') === 'true' && b?.getAttribute('aria-expanded') === 'true'
    }, null, { timeout: 3000 })
  } finally { await page.close() }
})

test('FP6 disabled 项：button disabled + 点击不切换', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    const acc = page.locator('main .wf-accordion').nth(1)
    const disabledBtn = acc.locator('.wf-accordion-summary', { hasText: '禁用项' })
    assert.notEqual(await disabledBtn.getAttribute('disabled'), null, 'disabled 属性存在')
    const openBefore = await acc.locator('.wf-accordion-item--open').count()
    await disabledBtn.click({ force: true })
    const openAfter = await acc.locator('.wf-accordion-item--open').count()
    assert.equal(openAfter, openBefore, '点击后 open 数不变')
  } finally { await page.close() }
})

test('FP7/FP8 受控 active + onChange 回流：初始 c1 展开 → 点 c2 → 互斥 [c2] → 回流文案更新', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    const acc = page.locator('main .wf-accordion').nth(2)
    const sum1 = acc.locator('.wf-accordion-summary', { hasText: '受控项一' })
    const sum2 = acc.locator('.wf-accordion-summary', { hasText: '受控项二' })
    assert.equal(await sum1.getAttribute('aria-expanded'), 'true', '受控初始 c1 展开')
    assert.equal(await sum2.getAttribute('aria-expanded'), 'false', '受控初始 c2 收起')
    // 点 c2 → onChange([c2]) → 父重渲染回流 → c2 展开 c1 收起（互斥）
    await sum2.click()
    await page.waitForFunction(() => {
      const keys = document.querySelector('main [data-acc-keys]')
      return keys?.textContent === 'c2'
    }, null, { timeout: 3000 })
    assert.equal(await sum2.getAttribute('aria-expanded'), 'true', '回流后 c2=true')
    assert.equal(await sum1.getAttribute('aria-expanded'), 'false', '回流后 c1=false（互斥）')
  } finally { await page.close() }
})

test('FP10 键盘导航：ArrowDown/Up 在 summary 间循环移动焦点', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    const first = page.locator('main .wf-accordion').first().locator('.wf-accordion-summary').first()
    await first.focus()
    const before = await page.evaluate(() => (document.activeElement as HTMLElement)?.textContent ?? '')
    await page.keyboard.press('ArrowDown')
    const after = await page.evaluate(() => (document.activeElement as HTMLElement)?.textContent ?? '')
    assert.notEqual(after, before, `ArrowDown 移焦（${before.slice(0, 6)}… → ${after.slice(0, 6)}…）`)
    await page.keyboard.press('ArrowUp')
    const back = await page.evaluate(() => (document.activeElement as HTMLElement)?.textContent ?? '')
    assert.equal(back, before, 'ArrowUp 回到起点（循环）')
  } finally { await page.close() }
})
