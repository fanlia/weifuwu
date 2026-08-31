/**
 * showcase 组件测试——Tooltip（/components/tooltip）——完整能力
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-tooltip.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/tooltip'

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

/** evaluate 轮询（组件页文档表格样式循环——rAF/定时器饿死规避） */
async function waitFor(page: import('playwright').Page, fn: () => Promise<boolean>, msg: string, timeoutMs = 5000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await page.evaluate(fn)) return
    await page.waitForTimeout(100)
  }
  throw new Error(`${msg} 超时`)
}

test('能力：4 方向 hover（上/下/左/右提示）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    for (const [btn, tip] of [['上', '保存文件'], ['下', '底部提示'], ['左', '左侧提示'], ['右', '右侧提示']]) {
      await page.locator('main .wf-surface button', { hasText: btn }).first().hover()
      // 通用 portal 文字查询（tooltip 类名多形态——evaluate 传参——闭包变量不可达页面）
      const deadline = Date.now() + 3000
      let ok = false
      while (Date.now() < deadline) {
        if (await page.evaluate((t) => (document.body.textContent ?? '').includes(t), tip)) { ok = true; break }
        await page.waitForTimeout(100)
      }
      assert.ok(ok, `${btn} 方向提示（${tip}）`)
      // 移开（下一个按钮 hover 前——鼠标移开）
      await page.mouse.move(700, 600)
      await page.waitForTimeout(250)
    }
  } finally { await page.close() }
})

test('位置：portal 归属 + fixed + 4 方向几何语义（函数 placement 渲染期解析——修复回归）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    for (const [btn, tip] of [['上', '保存文件'], ['下', '底部提示'], ['左', '左侧提示'], ['右', '右侧提示']]) {
      const b = page.locator('main .wf-surface button', { hasText: btn }).first()
      await b.hover()
      // 等面板出现 + 位置稳定（轮询——面板切换/布局竞态）
      let info: { inPortal: boolean; fixed: boolean; sem: boolean } | null = null
      for (let i = 0; i < 30; i++) {
        info = await page.evaluate(({ dir, text }) => {
          const tipEl = Array.from(document.querySelectorAll('.wf-tooltip-content')).find((e) => e.textContent?.includes(text))
          const panel = tipEl?.parentElement
          if (!panel) return null
          const pr = panel.getBoundingClientRect()
          if (pr.width === 0 || pr.height === 0) return null
          const wrap = panel.parentElement
          const inPortal = wrap?.id?.startsWith('__wf_portal') || !!wrap?.closest('#__wf_portal')
          const fixed = getComputedStyle(panel).position === 'fixed'
          // 锚点（main 内按钮——wrap 只含面板）
          const anchor = Array.from(document.querySelectorAll('main .wf-surface button')).find((x) => x.textContent?.trim() === dir)
          if (!anchor) return null
          const ar = anchor.getBoundingClientRect()
          const sem = dir === '上' ? pr.bottom < ar.top : dir === '下' ? pr.top > ar.bottom : dir === '左' ? pr.right < ar.left : pr.left > ar.right
          return { inPortal, fixed, sem }
        }, { dir: btn, text: tip })
        if (info && info.sem) break
        await page.waitForTimeout(100)
      }
      assert.ok(info, `${btn} 方向面板出现`)
      assert.ok(info!.inPortal, `${btn} 方向 portal 归属`)
      assert.ok(info!.fixed, `${btn} 方向 fixed 定位`)
      assert.ok(info!.sem, `${btn} 方向位置语义（面板在锚点${btn === '上' ? '上方' : btn === '下' ? '下方' : btn === '左' ? '左侧' : '右侧'}）`)
      // 精确对齐（CSS transform 残留双倍偏移 + 左右垂直居中回归——修复前必败）：
      // 上/下水平居中 ±2px；左/右垂直居中 ±2px；4 方向 gap ≥ 4；transform none
      let align: { cxDiff: number; cyDiff: number; gap: number; transform: string } | null = null
      for (let i = 0; i < 30; i++) {
        align = await page.evaluate(({ dir, text }) => {
          const tipEl = Array.from(document.querySelectorAll('.wf-tooltip-content')).find((e) => e.textContent?.includes(text))
          const panel = tipEl?.parentElement
          if (!panel) return null
          const pr = panel.getBoundingClientRect()
          if (pr.width === 0 || pr.height === 0) return null
          const b = Array.from(document.querySelectorAll('main .wf-surface button')).find((x) => x.textContent?.trim() === dir)
          if (!b) return null
          const br = b.getBoundingClientRect()
          const pcx = (pr.left + pr.right) / 2
          const bcx = (br.left + br.right) / 2
          const pcy = (pr.top + pr.bottom) / 2
          const bcy = (br.top + br.bottom) / 2
          const gap = dir === '上' ? br.top - pr.bottom : dir === '下' ? pr.top - br.bottom : dir === '左' ? br.left - pr.right : pr.left - br.right
          return { cxDiff: Math.abs(pcx - bcx), cyDiff: Math.abs(pcy - bcy), gap, transform: getComputedStyle(panel).transform }
        }, { dir: btn, text: tip })
        if (align && ((btn === '上' || btn === '下') ? align.cxDiff <= 2 : align.cyDiff <= 2) && align.gap >= 4 && align.transform === 'none') break
        await page.waitForTimeout(100)
      }
      assert.ok(align, `${btn} 方向对齐数据`)
      assert.ok(align!.transform === 'none', `${btn} 方向无 CSS transform 残留（${align!.transform}）`)
      if (btn === '上' || btn === '下') assert.ok(align!.cxDiff <= 2, `${btn} 方向水平居中（偏差 ${Math.round(align!.cxDiff)}px）`)
      else assert.ok(align!.cyDiff <= 2, `${btn} 方向垂直居中（偏差 ${Math.round(align!.cyDiff)}px）`)
      assert.ok(align!.gap >= 4, `${btn} 方向间距（${Math.round(align!.gap)}px）`)
      await page.mouse.move(700, 600)
      await page.waitForTimeout(250)
    }
  } finally { await page.close() }
})
