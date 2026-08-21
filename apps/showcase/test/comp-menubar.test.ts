/**
 * showcase 组件测试——Menubar（/components/navigation/menubar）——完整能力
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-menubar.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, assertPopupGeometry, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/navigation/menubar'

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

test('渲染零错误 + 菜单（文件/编辑）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    const text = await page.evaluate(() => document.body.textContent ?? '')
    for (const t of ['文件', '编辑']) assert.ok(text.includes(t), `菜单：${t}`)
  } finally { await page.close() }
})

test('能力：点击展开下拉 + 菜单项（新建/保存——快捷键）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    // 点「文件」→ 下拉（新建/保存 + Ctrl+N/Ctrl+S）
    await page.locator('main [class*="menubar"] button, main [class*="menubar"] [class*="trigger"]', { hasText: '文件' }).first().click()
    // evaluate 轮询（waitForFunction 可能被文档表格样式循环饿死——组件页通用规避）
    let ok = false
    for (let i = 0; i < 30; i++) {
      if (await page.evaluate(() => (document.body.textContent ?? '').includes('新建'))) { ok = true; break }
      await page.waitForTimeout(100)
    }
    assert.ok(ok, '下拉展开（新建出现）')
    const text = await page.evaluate(() => document.body.textContent ?? '')
    assert.ok(text.includes('Ctrl+N') && text.includes('保存'), '菜单项 + 快捷键')
    // Escape 关闭（portal 面板移除——文档区可能含 Ctrl+N 文字——portal 检查）
    await page.keyboard.press('Escape')
    let closed = false
    for (let i = 0; i < 30; i++) {
      const p = await page.evaluate(() => document.querySelector('#__wf_portal'))
      if (!p || !(await page.evaluate(() => document.querySelector('#__wf_portal')?.textContent ?? '').then((t) => t.includes('新建')))) { closed = true; break }
      await page.waitForTimeout(100)
    }
    assert.ok(closed, 'Escape 关闭')
  } finally { await page.close() }
})
test('位置：portal 归属 + fixed + 视口内 + 菜单 bottom', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    
    await page.locator('main [class*="menubar"] button, main [class*="menubar"] [class*="trigger"]', { hasText: '文件' }).first().click()
    await assertPopupGeometry(page, { anchorText: '文件', dir: 'bottom', transformNone: true })
  } finally { await page.close() }
})
