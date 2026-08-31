/**
 * showcase 组件测试——Anchor（/components/Anchor）——全功能点固化
 * 清单：design/COMPONENT-VERIFICATION-CHECKLIST.md「Anchor」组（playwright 实测后固化）
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-anchor.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/anchor'

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
  await page.waitForSelector('main .wf-anchor-nav')
}

test('FP1/FP2 受控初始高亮 + 点击切换 + onAnchorChange 回流', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    const links = page.locator('main .wf-anchor-link')
    assert.equal(await links.count(), 3, '3 锚点项')
    assert.ok((await page.evaluate(() => document.querySelector('main .wf-anchor-link--active')?.textContent ?? '')).includes('第一节'), '受控初始高亮（activeKey）')
    await links.nth(1).click()
    await page.waitForFunction(() => (document.querySelector('main .wf-anchor-link--active')?.textContent ?? '').includes('第二节'), null, { timeout: 4000 })
  } finally { await page.close() }
})

test('FP3 useHash 默认 false：点击不改 location.hash', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.locator('main .wf-anchor-link').nth(1).click()
    await page.waitForTimeout(400)
    assert.equal(await page.evaluate(() => location.hash), '', 'hash 未被写入')
  } finally { await page.close() }
})

test('FP4 滚动跟随高亮（offsetTop 阈值）：末节滚入视口 → 高亮跟随', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.evaluate(() => document.getElementById('anchor-c')?.scrollIntoView())
    await page.waitForFunction(() => (document.querySelector('main .wf-anchor-link--active')?.textContent ?? '').includes('第三节'), null, { timeout: 4000 })
  } finally { await page.close() }
})

