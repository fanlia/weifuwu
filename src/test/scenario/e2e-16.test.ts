/**
 * 场景 e2e 第十六文件——高频渲染循环（打字机模式——引擎锚稳定回归）
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

test('typewriter-loop：高频渲染（文本变化）零错误——锚稳定', async () => {
  const page = await browser.newPage()
  const errs: string[] = []
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 150)) })
  try {
    await openScenario(page, BASE, 'typewriter-loop')
    // 渲染循环运行 1s（~15+ 次渲染）——期间零 console.error + 结构完整
    await page.waitForTimeout(1100)
    const html = await page.evaluate(() => document.querySelector('.tw-scene')?.innerHTML ?? '')
    // 结构完整：静态内容 + 打字机 word + 光标
    assert.ok(html.includes('静态内容'), `静态内容保留（实际 ${html.slice(0, 120)}）`)
    assert.ok(html.includes('▍'), '光标保留')
    assert.deepEqual(errs, [], `高频渲染零错误（实际: ${errs[0] ?? '无'}）`)
  } finally {
    await page.close()
  }
})

test('render-loop：纯结构渲染循环（计数变化）零错误', async () => {
  const page = await browser.newPage()
  const errs: string[] = []
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 150)) })
  try {
    await openScenario(page, BASE, 'render-loop')
    await page.waitForTimeout(900)
    const text = await page.evaluate(() => document.querySelector('.loop-scene')?.textContent ?? '')
    assert.ok(text.includes('尾随'), `结构保留（实际 ${text.slice(0, 80)}）`)
    assert.deepEqual(errs, [], `渲染循环零错误（实际: ${errs[0] ?? '无'}）`)
  } finally {
    await page.close()
  }
})
