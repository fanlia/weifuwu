/**
 * showcase 组件测试——Tooltip（/components/overlay/tooltip）——完整能力
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-tooltip.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/overlay/tooltip'

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

/** evaluate 轮询（组件页文档表格样式循环——rAF/定时器饿死规避） */
async function waitFor(page: import('playwright').Page, fn: () => Promise<boolean>, msg: string, timeoutMs = 5000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await page.evaluate(fn)) return
    await page.waitForTimeout(100)
  }
  throw new Error(`${msg} 超时`)
}

test('能力：4 方向 hover（上/下/左/右提示）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    for (const [btn, tip] of [['上', '保存文件'], ['下', '底部提示'], ['左', '左侧提示'], ['右', '右侧提示']]) {
      await page.locator('main .wf-surface button', { hasText: btn }).first().hover()
      // 通用 portal 文字查询（tooltip 类名多形态——evaluate 传参——闭包变量不可达页面）
      const deadline = Date.now() + 3000
      let ok = false
      while (Date.now() < deadline) {
        if (await page.evaluate((t) => (document.body.textContent ?? '').includes(t), tip)) { ok = true; break }
        await page.waitForTimeout(100)
      }
      assert.ok(ok, `${btn} 方向提示（${tip}）`)
      // 移开（下一个按钮 hover 前——鼠标移开）
      await page.mouse.move(700, 600)
      await page.waitForTimeout(250)
    }
  } finally { await page.close() }
})
