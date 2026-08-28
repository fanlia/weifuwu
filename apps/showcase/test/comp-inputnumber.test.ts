/**
 * showcase 组件测试——InputNumber（/components/input/inputnumber）
 *
 * 每组件一个测试文件（单独运行）：
 *   node --env-file=.env --test apps/showcase/test/comp-inputnumber.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/input/inputnumber'

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

test('渲染零错误 + 双控件（temperature/max_tokens）', async () => {
  const page = await browser.newPage()
  try {
    const errors = await openShowcase(page, BASE, COMP_PATH)
    assert.deepEqual(errors.filter((e) => !e.includes('Failed to load resource')), [], `零错误（实际: ${errors[0] ?? '无'}）`)
    await page.waitForFunction(() => (document.body.textContent ?? '').includes('temperature: 0.7'), 'temperature 渲染', { timeout: 3000 })
  } finally {
    await page.close()
  }
})

test('demo 交互：输入 max_tokens → 状态文字更新', async () => {
  const page = await browser.newPage()
  try {
    await openShowcase(page, BASE, COMP_PATH)
    // 第二个输入（max_tokens——type=text 数字输入）
    const inputs = page.locator('main .wf-surface input').nth(1)
    await inputs.fill('3000')
    await page.waitForFunction(() => (document.body.textContent ?? '').includes('max_tokens: 3000'), 'max_tokens 更新', { timeout: 3000 })
  } finally {
    await page.close()
  }
})

test('SSR/水合一致性：禁 JS 首帧 = 完整页面（面包屑/标题/活体 demo/页脚）', async () => {
  // **SSR ≡ SPA 首帧（2026-08——刷新闪烁/页面不一致根治）**：SSR 必须是
  // 同一棵组件树（Shell+ComponentPage）——禁 JS 快照含 demo——接管后
  // 结构一致（曾经：SSR 只有 Markdown——刷新先见文档页、加载后整页跳变）
  const ctx = await browser.newContext({ javaScriptEnabled: false })
  const page = await ctx.newPage()
  try {
    await page.goto(BASE + COMP_PATH)
    const body = await page.textContent('body')
    assert.ok(body?.includes('活体 demo'), 'SSR 首帧含活体 demo 区块')
    assert.ok(body?.includes('temperature: 0.7'), 'SSR 首帧含 demo 初始值')
    assert.ok(body?.includes('InputNumber'), 'SSR 首帧含组件标题')
    assert.ok(body?.includes('weifuwu showcase'), 'SSR 首帧含页脚')
    const demoCount = await page.locator('.wf-inputnumber-wrap').count()
    assert.equal(demoCount, 2, 'SSR 首帧双控件（temperature/max_tokens）')
  } finally {
    await page.close()
    await ctx.close()
  }
})

test('demo 交互：单击增加/减少恰好一步（无重复步进回归）', async () => {
  const page = await browser.newPage()
  try {
    await openShowcase(page, BASE, COMP_PATH)
    await page.waitForFunction(() => (document.body.textContent ?? '').includes('temperature: 0.7'), '初始 0.7', { timeout: 3000 })
    const up = page.locator('main .wf-inputnumber button[aria-label="增加"]').first()
    const down = page.locator('main .wf-inputnumber button[aria-label="减少"]').first()
    // 单击增加——step=0.1——只能前进 0.1（旧 bug：pointerdown 预步进 + click 双步进 → 0.9）
    await up.click()
    await page.waitForFunction(() => (document.body.textContent ?? '').includes('temperature: 0.8'), '单击增加 = 单步 0.8', { timeout: 3000 })
    assert.equal((await page.textContent('body'))?.includes('temperature: 0.9'), false, '未出现双步进 0.9')
    // 单击减少——回到 0.7
    await down.click()
    await page.waitForFunction(() => (document.body.textContent ?? '').includes('temperature: 0.7'), '单击减少 = 单步 0.7', { timeout: 3000 })
  } finally {
    await page.close()
  }
})
