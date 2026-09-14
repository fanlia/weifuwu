/**
 * showcase 组件测试——Markdown（/components/markdown）——全功能点固化
 * 清单：「Markdown」组（playwright 实测后固化）
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-markdown.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/markdown'

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

test('FP1-4 Markdown 全要素：标题/删除线/任务列表/表格/代码', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main h1')
    const info = await page.evaluate(() => {
      const md = document.querySelector('main [class*="markdown"], main .wf-md, main article') ?? document.querySelector('main')
      return {
        h1: !!md.querySelector('h1'), h2: md.querySelectorAll('h2').length,
        del: md.querySelectorAll('del, s').length, task: md.querySelectorAll('input[type="checkbox"]').length,
        table: !!md.querySelector('table'), code: !!md.querySelector('pre'), strong: md.querySelectorAll('strong, b').length,
      }
    })
    assert.ok(info.h1 && info.h2 >= 1, '标题')
    assert.ok(info.del >= 1, '删除线')
    assert.ok(info.task >= 2, `任务列表 ${info.task}`)
    assert.ok(info.table && info.code && info.strong >= 1, '表格+代码+加粗')
  } finally { await page.close() }
})
