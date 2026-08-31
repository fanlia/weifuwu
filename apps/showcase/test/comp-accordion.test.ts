/**
 * showcase 组件测试——Accordion（/components/accordion）——完整能力
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
  await page.waitForTimeout(300)
}

test('渲染零错误 + 3 项（无受控默认全部展开——组件行为）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    const text = await page.evaluate(() => document.body.textContent ?? '')
    for (const t of ['什么是 weifuwu？', '如何安装？', '组件库包含什么？']) assert.ok(text.includes(t), `标题：${t}`)
    // 无受控 active——组件默认全部展开（3 项内容可见）
    for (const c of ['全栈框架', 'npm install', '28 个 HTML 原语']) assert.ok(text.includes(c), `内容展开：${c}`)
  } finally { await page.close() }
})

test('能力：点击已展开项收起 → 再点互斥展开（默认 single 模式）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    const summary = page.locator('main .wf-accordion-summary', { hasText: '如何安装？' }).first()
    // 初始全部展开——点已展开项 → 收起（npm install 消失）
    await summary.click()
    await page.waitForFunction(() => !(document.body.textContent ?? '').includes('npm install'), '点击收起', { timeout: 3000 })
    // 再点 → 互斥展开（npm install 出现——其他项收起——[key] 只保留当前）
    await summary.click()
    await page.waitForFunction(() => {
      const t = document.body.textContent ?? ''
      return t.includes('npm install') && !t.includes('全栈框架') && !t.includes('28 个 HTML 原语')
    }, '互斥展开（single 模式——仅当前项）', { timeout: 3000 })
  } finally { await page.close() }
})
