/**
 * e2e-19——组件输出 Text ↔ 元素切换（diffSame 其余同态——导航崩溃修复回归）
 * 修复前：组件输出 Text → 元素（组件复用）——emit 无 remove——insert 到旧
 * Text 节点——DOMException（overlay → colorpicker 导航崩溃同根因）
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startScenarioServer, openScenario, type ScenarioServer } from './e2e-shared.ts'

let server: ScenarioServer
let BASE = ''
let browser: Browser

test.before(async () => {
  server = await startScenarioServer()
  BASE = server.base
  browser = await chromium.launch()
})

test.after(async () => {
  await browser?.close()
  server?.stop()
})

test('组件输出 Text→元素→Text 切换：零错误 + DOM 正确（insert 到 Text 崩溃回归）', async () => {
  const page = await browser.newPage()
  try {
    const errors: string[] = []
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 150)) })
    await openScenario(page, BASE, 'deep-output-switch')
    // 初始 Text 输出
    assert.ok(await page.evaluate(() => (document.querySelector('.deep-switch-wrap')?.textContent ?? '') === '文本输出'), '初始文本输出')
    // 切换 → 元素输出（修复前：insert 到旧 Text——DOMException）
    await page.locator('.deep-switch-btn').click()
    await page.waitForTimeout(400)
    assert.ok(await page.evaluate(() => !!document.querySelector('.deep-switch-wrap .deep-switch-inner')), '元素输出渲染')
    assert.ok(await page.evaluate(() => !Array.from(document.querySelectorAll('.deep-switch-wrap *')).some((e) => e.tagName === 'SPAN' && e.className === '' && e.textContent === '文本输出')), '旧文本不残留')
    // 再切回 → 文本
    await page.locator('.deep-switch-btn').click()
    await page.waitForTimeout(400)
    assert.ok(await page.evaluate(() => (document.querySelector('.deep-switch-wrap')?.textContent ?? '') === '文本输出'), '切回文本输出')
    // 渲染中断错误（修复前 console.error + 页面卡死）
    assert.deepEqual(errors.filter((e) => !e.includes('Failed to load resource')), [], `零错误（实际: ${errors[0] ?? '无'}）`)
  } finally {
    await page.close()
  }
})
