/**
 * e2e——异步加载后 rerender DOM 更新（B-用户实证：/deliverables 空态回归）
 *
 * 复现：Deliverables 页 load() 成功（files=9·API 200）+ renderFn 重跑读到
 * 最新状态（日志实证 files=9/loading=false）——**但 DOM 永远空态**——
 * async 组件「工厂外异步回调 → ctx.render()」的二次渲染断链。
 *
 * 本测试最小复现：工厂内 setTimeout（模拟异步取数）→ ctx.render() →
 * renderFn 重跑读新值——**DOM 必须更新**（id=async-status 变「已加载」）。
 * 修复前红（DOM 不变——框架 bug 复现）→ 修复后绿。
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

test('异步加载后 rerender：工厂外回调 ctx.render() 必须更新 DOM（用户实证断链）', async () => {
  const page = await browser.newPage()
  const errors: string[] = []
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 150)) })
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 150)))
  try {
    await openScenario(page, BASE, 'async-load-rerender')

    // 关键断言：异步回调后 DOM 必须更新为「已加载」——**本场景更新成功**
    // （说明通用「工厂外回调 ctx.render()」机制正常——Deliverables 空态
    // 另有特因——继续定位）
    await page.waitForFunction(
      () => document.querySelector('#async-status')?.textContent === '已加载',
      '异步加载后 DOM 更新',
      { timeout: 3000 },
    )
    assert.ok(true, '通用异步 rerender 机制正常（DOM 更新）——Deliverables 空态另有特因')

    // 页面零错误（断链不是显式报错——是静默丢更新——错误仍红线）
    assert.deepEqual(errors.filter((e) => !e.includes('Failed to load resource')), [], `页面零错误：${errors.join('; ')}`)
  } finally {
    await page.close()
  }
})
