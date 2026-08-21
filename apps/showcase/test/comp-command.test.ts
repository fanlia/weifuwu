/**
 * showcase 组件测试——Command（/components/overlay/command）——完整能力
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-command.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, assertPopupGeometry, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/overlay/command'

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

test('渲染零错误 + 打开命令面板 + 项 onSelect（新建聊天——shortcut）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.locator('main .wf-surface button', { hasText: '打开命令面板' }).first().click()
    await waitFor(page, () => Promise.resolve((document.body.textContent ?? '').includes('新建聊天')), '命令面板')
    assert.ok(await page.evaluate(() => (document.body.textContent ?? '').includes('搜索')), '命令项')
    // 选择「新建聊天」→ onSelect（关闭）
    await page.locator('#__wf_portal button, .wf-popup button', { hasText: '新建聊天' }).first().click()
    await waitFor(page, () => Promise.resolve(!(document.body.textContent ?? '').includes('新建聊天')), '选择关闭')
  } finally { await page.close() }
})
test('位置：portal 归属 + fixed + 视口内 + 居中面板', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    
    await page.locator('main .wf-surface button', { hasText: '打开命令面板' }).first().click()
    await assertPopupGeometry(page, { centered: true, transformNone: true })
  } finally { await page.close() }
})
