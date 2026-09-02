/**
 * showcase 组件测试——CitationCard（/components/citationcard）——全功能点固化
 * 清单：「CitationCard」组（playwright 实测后固化）
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-citationcard.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/citationcard'

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

test('FP1/FP2 折叠头 + maxVisible=3 + 溢出 +1', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main [class*="citation"]')
    const first = await page.evaluate(() => {
      const c = [...document.querySelectorAll('main [class*="citation"]')].find((x) => (x.textContent ?? '').includes('产品手册'))
      return { n: c?.querySelectorAll('.wf-citation-item').length, t: c?.textContent ?? '' }
    })
    assert.equal(first.n, 4, `3 可见 + 1 溢出行`)
    assert.ok(first.t.includes('+1'), '溢出徽标 +1')
    assert.ok(first.t.includes('引用来源'), '默认头文案')
  } finally { await page.close() }
})

test('FP3 展开全显（点折叠头 → 4 条）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main [class*="citation"]')
    const head = page.locator('main [class*="citation"]').first().locator('button, [class*="head"]').first()
    await head.click()
    await page.waitForFunction(() => {
      const c = [...document.querySelectorAll('main [class*="citation"]')].find((x) => (x.textContent ?? '').includes('产品手册'))
      return c?.querySelectorAll('.wf-citation-item').length === 4
    }, null, { timeout: 3000 })
  } finally { await page.close() }
})

test('FP4 url 链接面：仅带 url 条目渲染 a', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main [class*="citation"]')
    const info = await page.evaluate(() => {
      const c = [...document.querySelectorAll('main [class*="citation"]')].find((x) => (x.textContent ?? '').includes('产品手册'))
      const items = [...c.querySelectorAll('.wf-citation-item')]
      return items.map((i) => !!i.querySelector('a[href]'))
    })
    assert.equal(info.filter(Boolean).length, 1, `仅 c1 有 href 链接：${JSON.stringify(info)}`)
  } finally { await page.close() }
})

test('FP5 defaultExpanded：初始展开两实例条目可见', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main [class*="citation"]')
    const n = await page.evaluate(() => {
      const c = [...document.querySelectorAll('main [class*="citation"]')].find((x) => (x.textContent ?? '').includes('展开态条目一'))
      return c?.querySelectorAll('.wf-citation-item').length
    })
    assert.equal(n, 2, '初始展开无折叠')
  } finally { await page.close() }
})

test('FP6 onOpen：无 href a（role=button）+ 回调上抛 c.id', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main [class*="citation"]')
    await page.locator('main .wf-citation-item', { hasText: '可点击条目' }).first().locator('.wf-citation-link').click()
    await page.waitForFunction(() => (window).__citeOpen === 'o2', null, { timeout: 3000 })
    const noHref = await page.evaluate(() => {
      const item = [...document.querySelectorAll('main .wf-citation-item')].find((c) => (c.textContent ?? '').includes('可点击条目'))
      return !item?.querySelector('a')?.hasAttribute('href')
    })
    assert.equal(noHref, true, 'onOpen 模式无 href（role=button 语义）')
  } finally { await page.close() }
})

test('交互：整条 item 可点 + Enter 触发 onOpen（2027-09 语义修正回归）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main [role="button"]')
    await page.locator('main [role="button"]').filter({ hasText: '+1 条更多' }).first().click()
    const item = page.locator('main .wf-citation-item[role="button"]').filter({ hasText: '可点击条目' }).first()
    await item.click()
    await page.waitForFunction(() => (window as any).__citeOpen === 'o2', null, { timeout: 3000 })
    await item.focus()
    await page.keyboard.press('Enter')
    await page.waitForFunction(() => (window as any).__citeOpen === 'o2', null, { timeout: 3000 })
  } finally { await page.close() }
})
