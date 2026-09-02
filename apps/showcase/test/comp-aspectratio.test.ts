/**
 * showcase 组件测试——AspectRatio（/components/aspectratio）——全功能点固化
 * 清单：「AspectRatio」组（playwright 实测后固化）
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-aspectratio.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/aspectratio'

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

/** 容器几何（aspect-ratio 计算样式的非 auto 容器） */
function boxes(page: import('playwright').Page) {
  return page.evaluate(() => [...document.querySelectorAll('main div')]
    .filter((d) => {
      const s = getComputedStyle(d)
      return s.aspectRatio && s.aspectRatio !== 'auto'
    })
    .map((el) => ({ ratio: getComputedStyle(el).aspectRatio, w: el.getBoundingClientRect().width, h: el.getBoundingClientRect().height, text: (el.textContent ?? '').trim().slice(0, 4) })))
}

test('FP1 ratio=16/9（默认语义演示）：容器几何宽高比 ≈ 1.778', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    const b = (await boxes(page)).find((x) => x.text.startsWith('16'))
    assert.ok(b, '16:9 容器存在')
    assert.ok(Math.abs(b.w / b.h - 16 / 9) < 0.03, `实际 ${b.w}×${b.h} → ${(b.w / b.h).toFixed(3)}`)
  } finally { await page.close() }
})

test('FP2/FP3 ratio=1 与 4/3：几何随 ratio 数据面变化', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    const all = await boxes(page)
    const sq = all.find((x) => x.text === '1:1')
    const wide = all.find((x) => x.text === '4:3')
    assert.ok(sq && Math.abs(sq.w / sq.h - 1) < 0.03, `1:1 → ${(sq!.w / sq!.h).toFixed(3)}`)
    assert.ok(wide && Math.abs(wide.w / wide.h - 4 / 3) < 0.03, `4:3 → ${(wide!.w / wide!.h).toFixed(3)}`)
  } finally { await page.close() }
})

test('FP4 children 透传：全部容器内容渲染', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    const all = await boxes(page)
    assert.ok(all.length >= 3 && all.every((b) => b.text), '内容渲染')
  } finally { await page.close() }
})
