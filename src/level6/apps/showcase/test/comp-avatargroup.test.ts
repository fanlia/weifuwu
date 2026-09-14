/**
 * showcase 组件测试——Avatargroup（/components/avatargroup）——全功能点固化
 * 清单：「Avatargroup」组（playwright 实测后固化）
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-avatargroup.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/avatargroup'

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

test('FP1 max 溢出：3 可见 + "+1" 徽标', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main .wf-avatar')
    const t = await page.evaluate(() => document.querySelector('main')?.textContent ?? '')
    assert.ok(t.includes('张') && t.includes('李') && t.includes('王'), 'max=3 前三名可见')
    assert.ok(!t.includes('赵六'), '第 4 名被折叠')
    assert.ok(await page.evaluate(() => [...document.querySelectorAll('main *')].some((el) => /^\+1$/.test((el.textContent ?? '').trim()) && el.children.length === 0)), '溢出徽标 +1')
  } finally { await page.close() }
})

test('FP2 size 透传：sm 组头像更小', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main .wf-avatar')
    const ws = await page.evaluate(() => [...document.querySelectorAll('main .wf-avatar')].map((a) => Math.round(a.getBoundingClientRect().width)))
    assert.ok(Math.max(...ws) > Math.min(...ws), `两组尺寸不同（md=32 > sm=24）：${ws.join(',')}`)
  } finally { await page.close() }
})
