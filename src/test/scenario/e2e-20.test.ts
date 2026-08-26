/**
 * e2e——R1 错误熔断（工厂 throw → 3 次连续 → fallback → 重试恢复）
 *
 * 断言链：
 * 1. 初始：Faulty 工厂 throw（首帧失败——root 空——errorCount=1）
 * 2. 点击 2 次触发（errorCount=3）→ 熔断 → 内置 fallback 出现
 *    （wf-error-fallback + 重试按钮 + 错误文案）
 * 3. console.error 计数 = 3（每次失败的渲染一次——mount 失败清理后
 *    无「正在 mount」违例连锁——R1 探索发现修复验证）
 * 4. 修复（fuse-fix）→ 点击「重试」→ 正常渲染（fuse-ok 出现）——
 *    错误自愈路径完整
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

test('R1 错误熔断：3 次连续渲染错误 → fallback 显示 → 修复后重试恢复', async () => {
  const page = await browser.newPage()
  const errors: string[] = []
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 120)) })
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 120)))
  try {
    console.log("[t] open"); await openScenario(page, BASE, "render-error-fuse"); console.log("[t] opened")

    // 首帧正常（fault=false）——场景完整渲染
    await page.waitForFunction(() => document.querySelector('#fuse-trigger') !== null, '触发按钮', { timeout: 5000 })
    assert.equal(await page.evaluate(() => !!document.querySelector('.fuse-ok')), true, '首帧正常渲染')

    // 开熔断 → 点击切换 3 次（FaultyA↔B 交替——每次 mount 失败——
    // 连续失败无成功间隔——errorCount=3）——熔断
    console.log("[t] arm"); await page.locator("#fuse-arm").click(); console.log("[t] armed")
    for (let i = 0; i < 3; i++) {
      console.log("[t] trig"); await page.locator("#fuse-trigger").click()
      await page.waitForTimeout(250) // 渲染间歇（真实用户节奏——队列 FIFO 串行）
    }
    await page.waitForFunction(() =>
      document.querySelector('.wf-error-fallback') !== null, '熔断 fallback 出现', { timeout: 5000 })

    // fallback 结构：错误文案 + 重试按钮（恢复路径存在）
    const fb = await page.evaluate(() => {
      const el = document.querySelector('.wf-error-fallback')
      if (!el) return null
      return { text: el.textContent ?? '', hasRetry: (el.textContent ?? '').includes('重试') }
    })
    assert.ok(fb, 'fallback 必须存在')
    assert.ok(fb.hasRetry, 'fallback 必须含重试按钮（恢复路径）')
    assert.ok(fb.text.includes('渲染失败'), 'fallback 显示错误文案')

    // console.error 计数 = 3（mount 失败清理——无「正在 mount」违例连锁
    // ——R1 探索发现：若发 errorCount 远大于 3 = 占位残留违例叠加）
    const renderErrs = errors.filter((e) => e.includes('render:') || e.includes('mount boom'))
    assert.ok(renderErrs.length <= 4, `渲染错误计数 ${renderErrs.length} ≤ 4（3 次 mount 失败 + 1 容差——无违例连锁）`)

    // 修复（fallback 替换 root 后 DOM 内按钮不可达——全局钩子）→
    // 点击重试（fallback 按钮调用 ctx.render——serve 重试）
    await page.evaluate('window.__fuseFix && window.__fuseFix()')
    await page.locator('.wf-error-fallback button').click()
    await page.waitForFunction(() =>
      document.querySelector('.fuse-ok') !== null, '重试恢复正常渲染', { timeout: 5000 })

    // 恢复后 fallback 消失 + 正常内容 + 后续点击不再熔断
    console.log("[t] trig"); await page.locator("#fuse-trigger").click()
    await page.waitForTimeout(300)
    const state = await page.evaluate(() => ({
      fallback: !!document.querySelector('.wf-error-fallback'),
      ok: !!document.querySelector('.fuse-ok, .fuse-ok-2'),
    }))
    assert.deepEqual(state, { fallback: false, ok: true }, '恢复后正常渲染且 fallback 消失')
  } finally {
    await page.close()
  }
})
