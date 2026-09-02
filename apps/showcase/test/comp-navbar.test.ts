/**
 * showcase 组件测试——NavBar（/components/navbar）——移动端顶栏
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-navbar.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/navbar'

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

test('渲染零错误 + 顶栏结构（header/title/left/right 槽）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    const bar = await page.evaluate(() => {
      const el = document.querySelector('.wf-nav-bar')
      return {
        exists: !!el,
        title: el?.querySelector('.wf-nav-bar-title')?.textContent?.trim() ?? '',
        sides: el?.querySelectorAll('.wf-nav-bar-side').length ?? 0,
      }
    })
    assert.ok(bar.exists, '顶栏渲染')
    assert.equal(bar.title, '工作台', '标题')
    assert.equal(bar.sides, 2, '左右槽（实际 ' + bar.sides + '）')
  } finally { await page.close() }
})

test('能力：left 槽交互（返回按钮 → 点击计数更新）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    const txt = await page.evaluate(() => document.body.textContent ?? '')
    assert.ok(!txt.includes('点击次数：1'), '初始 0 次')
    await page.locator('main button[aria-label="返回"]').click()
    await page.waitForTimeout(100)
    const after = await page.evaluate(() => document.body.textContent ?? '')
    assert.ok(after.includes('点击次数：1'), '点击后计数更新（left 槽组合式交互）')
  } finally { await page.close() }
})
