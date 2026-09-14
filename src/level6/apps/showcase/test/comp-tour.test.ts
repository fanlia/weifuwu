/**
 * showcase 组件测试——Tour（/components/tour）
 *
 * 每组件一个测试文件（一个地址 + 一个组件——单独运行——小步快跑）：
 *   node --env-file=.env --test apps/showcase/test/comp-tour.test.ts
 *
 * 锁定修复（showcase 交互扫描抓出——agent-browser + playwright 回归）：
 * - usePopup positioning 'none' 不刷新 → 气泡定位视口左上角（rect 0）
 * - 组件卸载不清理输出 portal → 完成关闭后气泡残留
 * - placement 'top' 视口越界 → 目标贴顶时气泡不可见（翻转 bottom）
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser, type Page } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/tour'

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

/** 打开组件页 + 点「开始引导」→ 等气泡出现——**零 [vdom] 警告锁定**
 *  （2026-08——`{open && <Tour/>}` 尾部条件渲染曾触发「列表含无 key 的
 *  组件项」误报——空洞槽条件渲染位置稳定——检测器实槽翻转精准化后归零） */
async function openTour(page: Page): Promise<{ warns: string[] }> {
  const errors = await openShowcase(page, BASE, COMP_PATH)
  assert.deepEqual(errors.filter((e) => !e.includes('Failed to load resource')), [], '组件页渲染零错误')
  const warns: string[] = []
  page.on('console', (m) => { if (m.type() === 'warning') warns.push(m.text()) })
  await page.click('#tour-a')
  await page.waitForSelector('.wf-tour-bubble', { timeout: 3000 })
  return { warns }
}

test('渲染零错误（组件页 + 文档）', async () => {
  const page = await browser.newPage()
  try {
    const errors = await openShowcase(page, BASE, COMP_PATH)
    assert.deepEqual(errors.filter((e) => !e.includes('Failed to load resource')), [], `零错误（实际: ${errors[0] ?? '无'}）`)
    const text = await page.evaluate(() => document.getElementById('root')?.textContent ?? '')
    assert.ok(text.includes('Tour') && text.includes('活体'), '组件页内容（标题 + 活体 demo）')
  } finally {
    await page.close()
  }
})

test('demo 交互：开始引导 → 气泡定位到目标（rect 非 0）', async () => {
  const page = await browser.newPage()
  try {
    const { warns } = await openTour(page)
    assert.ok(!warns.some((w) => w.includes('无 key')), `零「无 key 组件项」误报（实际: ${warns[0] ?? '无'}）`)
    const pos = await page.evaluate(() => {
      const h = document.querySelector('.wf-tour-highlight') as HTMLElement
      const b = document.querySelector('.wf-tour-bubble') as HTMLElement
      const t = document.querySelector('#tour-a') as HTMLElement
      const tr = t.getBoundingClientRect()
      return {
        hl: h ? { left: parseFloat(h.style.left), top: parseFloat(h.style.top) } : null,
        t: { left: tr.left, top: tr.top },
        bVisible: b ? b.getBoundingClientRect().width > 0 : false,
      }
    })
    assert.ok(pos.hl, 'highlight 渲染')
    assert.ok(Math.abs(pos.hl.left - pos.t.left) < 1 && Math.abs(pos.hl.top - pos.t.top) < 1, `highlight 对齐目标（${pos.hl.left},${pos.hl.top} vs ${pos.t.left},${pos.t.top}）`)
    assert.ok(pos.bVisible, '气泡可见')
    assert.equal(await page.locator('.wf-tour-step').textContent(), '1 / 3', '步骤 1/3')
  } finally {
    await page.close()
  }
})

test('demo 交互：下一步 → 气泡跟随目标（placement right）', async () => {
  const page = await browser.newPage()
  try {
    await openTour(page)
    await page.click('.wf-tour-btn--primary')
    await page.waitForFunction(() => document.querySelector('.wf-tour-step')?.textContent === '2 / 3')
    const pos = await page.evaluate(() => {
      const b = document.querySelector('.wf-tour-bubble') as HTMLElement
      const t = document.querySelector('#tour-b') as HTMLElement
      const tr = t.getBoundingClientRect()
      return { bl: b ? parseFloat(b.style.left) : NaN, tr: tr.left + tr.width }
    })
    assert.ok(pos.bl > pos.tr, `气泡在目标右侧（${pos.bl} > ${pos.tr}）`)
  } finally {
    await page.close()
  }
})

test('demo 交互：最后一步完成 → 关闭 + portal 清空 + 可重开', async () => {
  const page = await browser.newPage()
  try {
    await openTour(page)
    await page.click('.wf-tour-btn--primary')
    await page.waitForFunction(() => document.querySelector('.wf-tour-step')?.textContent === '2 / 3')
    await page.click('.wf-tour-btn--primary')
    await page.waitForFunction(() => document.querySelector('.wf-tour-step')?.textContent === '3 / 3')
    // 3/3 气泡视口内（placement top 翻转——目标贴顶）
    const inView = await page.evaluate(() => {
      const b = document.querySelector('.wf-tour-bubble') as HTMLElement
      return b ? b.getBoundingClientRect().top >= 0 : false
    })
    assert.ok(inView, '最后一步气泡在视口内（翻转）')
    // 完成 → 关闭
    await page.click('.wf-tour-btn--primary')
    await page.waitForFunction(() => !document.querySelector('.wf-tour-bubble'), 'Tour 关闭', { timeout: 3000 })
    const portalGone = await page.evaluate(() => {
      const p = document.querySelector('#__wf_portal-tour')
      return !p || p.innerHTML === ''
    })
    assert.ok(portalGone, 'portal 清空（组件卸载清理）')
    // 可重开（状态复位）
    await page.click('#tour-a')
    await page.waitForSelector('.wf-tour-bubble', { timeout: 3000 })
    assert.equal(await page.locator('.wf-tour-step').textContent(), '1 / 3', '重开回到第一步')
  } finally {
    await page.close()
  }
})
