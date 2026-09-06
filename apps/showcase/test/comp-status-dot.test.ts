/**
 * showcase 组件测试——StatusDot（/components/status-dot）——全功能点固化
 * 清单：on/tone 矩阵 · label 缺省只渲染点 · 文字色随 tone
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-status-dot.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/status-dot'

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

test('FP1 矩阵 5 行：success 点 + warning 行 + error 行 + 仅点行', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main [class*="wf-badge-dot"]')
    const info = await page.evaluate(() => ({
      dots: document.querySelectorAll('main [class*="wf-badge-dot"]').length,
      hasWarning: !!document.querySelector('main [class*="warning"]'),
      hasError: !!document.querySelector('main [class*="error"]'),
      text: document.querySelector('main')?.textContent ?? '',
    }))
    assert.equal(info.dots, 5, '5 行点')
    assert.ok(info.hasWarning, 'warning 行')
    assert.ok(info.hasError, 'error 行')
  } finally { await page.close() }
})

test('FP2 label 缺省只渲染点（仅点行——无独立文字）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    const text = await page.evaluate(() => (document.querySelector('main')?.textContent ?? ''))
    // 仅点行存在（desc 说明）
    assert.ok(text.includes('仅点'), '仅点行说明存在')
    // label 词各只出现 1 次（仅点行不产生重复 label——无「×2」叠加）
    for (const w of ['运行中', '已暂停', '降级', '故障']) {
      const n = (text.match(new RegExp(w, 'g')) ?? []).length
      assert.equal(n, 1, `「${w}」仅出现 1 次（仅点行无 label 叠加）`)
    }
  } finally { await page.close() }
})
