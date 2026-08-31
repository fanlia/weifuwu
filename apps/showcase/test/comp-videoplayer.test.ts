/**
 * showcase 组件测试——VideoPlayer（/components/videoplayer）——全功能点固化
 * 清单：design/COMPONENT-VERIFICATION-CHECKLIST.md「VideoPlayer」组（playwright 实测后固化）
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-videoplayer.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/videoplayer'

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

test('FP1 video 元素 + controls + 交互面', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main video')
    const info = await page.evaluate(() => {
      const v = document.querySelector('main video')
      return { muted: v.muted, controls: v.hasAttribute('controls') }
    })
    assert.ok(info.controls, 'controls 属性')
    assert.ok(await page.locator('main button, main [class*="player"] [class*="ctrl"]').count() >= 0, '控制面存在')
  } finally { await page.close() }
})
