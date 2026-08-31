/**
 * showcase 组件测试——CopyButton（/components/copybutton）
 *
 * 每组件一个测试文件（一个地址 + 一个组件——单独运行——小步快跑）：
 *   node --env-file=.env --test apps/showcase/test/comp-copybutton.test.ts
 *
 * 锁定修复（showcase 交互扫描抓出）：Clipboard API 权限拒绝
 * （NotAllowedError——非 https/localhost 环境）→ unhandled rejection
 * 污染错误基线——create-client-browser copyText 降级链（clipboard →
 * textarea+execCommand → 静默）——复制失败不中断交互。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/copybutton'

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

test('渲染零错误（组件页 + 文档）', async () => {
  const page = await browser.newPage()
  try {
    const errors = await openShowcase(page, BASE, COMP_PATH)
    assert.deepEqual(errors.filter((e) => !e.includes('Failed to load resource')), [], `零错误（实际: ${errors[0] ?? '无'}）`)
  } finally {
    await page.close()
  }
})

test('demo 交互：点击复制 → 成功提示 + 无未处理错误（剪贴板降级）', async () => {
  const page = await browser.newPage()
  try {
    await openShowcase(page, BASE, COMP_PATH)
    // demo 区第一个复制按钮
    const btn = page.locator('main .wf-copy-btn').first()
    await btn.click()
    // 成功提示（已复制——check 图标/文字——按钮级）
    await page.waitForFunction(() => document.querySelector('.wf-copy-btn')?.textContent?.includes('已复制') ?? false, '复制成功提示', { timeout: 3000 })
    // 无未处理错误（clipboard 权限拒绝已降级——不冒泡）
    const errs: string[] = []
    page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()) })
    await page.waitForTimeout(300)
    assert.deepEqual(errs.filter((e) => !e.includes('Failed to load resource')), [], `点击复制无错误（实际: ${errs[0] ?? '无'}）`)
    // 2s 后按钮提示复位（回到复制图标/文字——按钮级断言——
    // 页面文档正文可能含"已复制"字样——不误判）
    await page.waitForFunction(() => {
      const b = document.querySelector('.wf-copy-btn')
      return b !== null && !(b.textContent ?? '').includes('已复制')
    }, '提示复位', { timeout: 3500 })
  } finally {
    await page.close()
  }
})
