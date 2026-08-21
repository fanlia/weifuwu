/**
 * showcase 冒烟 input——组件 demo 页全量渲染零错误
 * playwright 驱动（node:test + playwright——项目场景层模式）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'
import { components } from '../src/registry/components.ts'

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

test('showcase 组件页渲染零错误（input+advanced——33 页）', async () => {
  const cats = new Set(['input', 'advanced'])
  const pages = components.filter((c) => cats.has(c.category))
  assert.ok(pages.length >= 15, `分组页数（实际 ${pages.length}）`)
  const page = await browser.newPage()
  try {
    const failed: string[] = []
    for (const c of pages) {
      const errors = await openShowcase(page, BASE, `/components/${c.category}/${c.id}`)
      // 媒体加载类（网络资源）不算渲染错误
      const real = errors.filter((e) => !e.includes('Failed to load resource'))
      if (real.length > 0) failed.push(`${c.id}: ${real[0]}`)
    }
    assert.deepEqual(failed, [], `全零错误（失败 ${failed.length} 页——${failed.slice(0, 3).join('; ')}）`)
  } finally {
    await page.close()
  }
})
