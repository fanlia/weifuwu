/**
 * 场景 e2e——perf-applier（消费端性能防线契约——2027-09）
 *
 * 触发：admin 全量 1604 行切走 59s（Long Task 59172ms）——根因 procRemove
 * 每次全量扫 nodes/events/refs 三表（O(N²)）——修复：childIds/byChild 索引
 * + removeOne/unmountOne 单删——59s → 310ms。
 *
 * 本契约 = 回归防线：6000 行 × 4 节点（24000 节点 + 6000 事件绑定）——
 * 卸载/更新计时断言（旧代码 10s+ 必挂；新代码 <500ms）——防 O(N²) 回归。
 * 阈值取 2s（CI 抖动 2x 安全边——与 contract 10k 基线同一纪律）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser, type Page } from 'playwright'
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

/** 真实 DOM 对账（id 唯一/格式/无锚残留——结构不变量） */
async function auditPerfDom(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const errors: string[] = []
    const ids = new Set<string>()
    const walk = (el: Element): void => {
      for (const child of Array.from(el.childNodes)) {
        if (child.nodeType === 8) {
          if (!child.textContent?.includes('wf-hole')) errors.push(`锚格式非法: ${child.textContent}`)
          continue
        }
        if (child.nodeType !== 1) continue
        const id = (child as HTMLElement).getAttribute('data-wf-id')
        if (!id) { errors.push(`缺 data-wf-id: ${(child as HTMLElement).tagName}`); continue }
        if (ids.has(id)) errors.push(`id 重复: ${id}`)
        ids.add(id)
        walk(child as HTMLElement)
      }
    }
    walk(document.querySelector('#root')!)
    return errors
  })
}

test('perf-applier：6000 行渲染 + 卸载 <2s + 更新 diff 完成 + 对账零违例', async () => {
  const page = await browser.newPage()
  page.on('pageerror', (e) => console.error('[pageerror]', String(e).slice(0, 300)))
  try {
    await openScenario(page, BASE, 'perf-applier')

    // 1) 初始大列表渲染完成（6000 行——每行 3 子节点）
    await page.waitForSelector('.perf-list .perf-row')
    const rows = await page.locator('.perf-row').count()
    assert.equal(rows, 6000, `大列表渲染完整（6000 行）——实际 ${rows}`)

    // 2) 卸载（nav-away——旧路径 O(N²) 10s+——阈值 2s）
    const t0 = Date.now()
    await page.click('#perf-nav-away')
    await page.waitForSelector('.perf-gone')
    const awayMs = Date.now() - t0
    assert.ok(awayMs < 2000, `卸载 <2s（O(N²) 回归防线）——实际 ${awayMs}ms`)

    // 3) 回列表（重新渲染——6000 行）
    await page.click('#perf-nav-back')
    await page.waitForSelector('.perf-list .perf-row')
    const rows2 = await page.locator('.perf-row').count()
    assert.equal(rows2, 6000, `回切后列表完整——实际 ${rows2}`)

    // 4) 更新（diff 路径——6000 行 setText——阈值 1s）
    const t1 = Date.now()
    await page.click('#perf-update')
    await page.waitForFunction(() => document.querySelector('.perf-name')?.textContent?.includes('-1'))
    const updateMs = Date.now() - t1
    assert.ok(updateMs < 1000, `更新 diff <1s——实际 ${updateMs}ms`)

    // 5) 对账（id 唯一/格式/锚合法——三表索引不影响结构不变量）
    const errors = await auditPerfDom(page)
    assert.deepEqual(errors, [], `结构对账零违例——${errors.slice(0, 5).join('; ')}`)

    console.log(`  [perf] 卸载 ${awayMs}ms · 更新 ${updateMs}ms · 6000 行`)
  } finally {
    await page.close()
  }
})
