/**
 * showcase 组件测试——FilePreview（/components/filepreview）——全功能点固化
 * 清单：design/COMPONENT-VERIFICATION-CHECKLIST.md「FilePreview」组（playwright 实测后固化）
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-filepreview.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/filepreview'

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

test('FP1/FP2 md 远程加载渲染：标题+列表+引用（wire-fake 文件服务）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main .wf-filepreview-doc', { timeout: 5000 })
    const t = await page.evaluate(() => document.querySelector('main .wf-filepreview')?.textContent ?? '')
    assert.ok(t.includes('weifuwu 文件预览'), '远程 md 标题')
    assert.ok(t.includes('Markdown 安全渲染') && t.includes('事务层'), '列表项渲染')
  } finally { await page.close() }
})

test('FP3 editable：编辑模式切换 → Editor（事件流事务层）出现', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main .wf-filepreview-actions', { timeout: 5000 })
    await page.locator('main button', { hasText: /编辑/ }).first().click()
    await page.waitForSelector('main .wf-editor-content', { timeout: 5000 })
  } finally { await page.close() }
})
