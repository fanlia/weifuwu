/**
 * 组件冒烟 e2e——陈列页渲染全量 + 点击扫描（console.error 零）
 *
 * 冒烟基线：每个组件渲染成功（data-smoke 标记存在）+ 可点击元素点击不崩。
 * 深度行为断言在后续文件（e2e-7+——核心组件各自交互）。
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

test('component-smoke：40 核心组件全部渲染（data-smoke 标记）', async () => {
  const page = await browser.newPage()
  const errors: string[] = []
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 150)) })
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 150)))
  try {
    await openScenario(page, BASE, 'component-smoke')

    // 渲染数核对（40 项）
    const rendered = await page.evaluate(() =>
      Array.from(document.querySelectorAll('.smoke-item')).map((el) => el.getAttribute('data-smoke')))
    assert.equal(rendered.length, 40, `陈列渲染数（实际 ${rendered.length}）`)
    // 每项有内容（非空渲染）
    const empty = await page.evaluate(() =>
      Array.from(document.querySelectorAll('.smoke-item')).filter((el) => el.children.length < 2).map((el) => el.getAttribute('data-smoke')))
    assert.deepEqual(empty, [], `无空渲染项（实际: ${empty.join(',')}）`)
    // 渲染期 console.error 零
    assert.deepEqual(errors, [], `渲染期无错误（实际: ${errors.slice(0, 2).join(' | ')}）`)
  } finally {
    await page.close()
  }
})

test('component-smoke：全量可点击元素点击扫描——交互不崩（console.error 零）', async () => {
  const page = await browser.newPage()
  const errors: string[] = []
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 150)) })
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 150)))
  try {
    await openScenario(page, BASE, 'component-smoke')

    // 扫描所有可点击元素（button/role=button/tabindex）——逐个点击
    const clickables = await page.evaluate(() => {
      const els = Array.from(document.querySelectorAll('.smoke-item button, .smoke-item [role="button"], .smoke-item [tabindex], .smoke-item input, .smoke-item select'))
      return els.map((el) => {
        const item = el.closest('.smoke-item')
        return { item: item?.getAttribute('data-smoke') ?? '?', tag: el.tagName, cls: (el as HTMLElement).className?.toString().slice(0, 40) }
      })
    })
    assert.ok(clickables.length >= 40, `可点击元素数量（实际 ${clickables.length}）`)
    // 逐个点击（element.click——真实 JS 点击——事件链路验证）
    let clicked = 0
    for (let i = 0; i < clickables.length; i++) {
      try {
        await page.evaluate((idx) => {
          const els = Array.from(document.querySelectorAll('.smoke-item button, .smoke-item [role="button"], .smoke-item [tabindex], .smoke-item input, .smoke-item select'))
          const el = els[idx] as HTMLElement
          el.click()
        }, i)
        clicked++
      } catch { /* 单个失败不中断扫描 */ }
    }
    assert.ok(clicked > 0, '点击执行')
    // 点击后错误零（交互不崩——事件 handler 异常隔离）
    assert.deepEqual(errors, [], `交互无错误（实际: ${errors.slice(0, 2).join(' | ') || '(无)'}）`)
  } finally {
    await page.close()
  }
})
