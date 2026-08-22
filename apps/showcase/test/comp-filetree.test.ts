/**
 * showcase 组件测试——FileTree（/components/data/filetree）——完整能力
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-filetree.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/editor/filetree'

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

test('能力：目录列表渲染（图标/名称/大小/相对时间）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    const tree = page.locator('.wf-filetree')
    assert.ok(await tree.count() > 0, 'FileTree 渲染')
    // 根目录条目：docs/src/README.md
    await page.waitForFunction(() => {
      const t = document.body.textContent ?? ''
      return t.includes('README.md') && t.includes('docs') && t.includes('src')
    }, '根目录列表', { timeout: 4000 })
    // 大小格式化（README.md 2048 → 2.0KB）
    await page.waitForFunction(() => (document.body.textContent ?? '').includes('2.0KB'), '大小格式化', { timeout: 4000 })
    // 相对时间（1 小时前）
    await page.waitForFunction(() => (document.body.textContent ?? '').includes('小时前'), '相对时间', { timeout: 4000 })
    // 面包屑根
    assert.equal(await tree.locator('.wf-filetree-crumb').first().textContent(), '/')
  } finally { await page.close() }
})

test('能力：目录切换（点击目录 → 面包屑更新 → 新列表）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.locator('.wf-filetree-item', { hasText: 'docs' }).click()
    await page.waitForFunction(() => (document.body.textContent ?? '').includes('api.md'), 'docs 列表', { timeout: 4000 })
    // 面包屑：/ docs
    await page.waitForFunction(() => {
      const crumbs = Array.from(document.querySelectorAll('.wf-filetree-crumb')).map((c) => c.textContent)
      return crumbs.includes('docs') && crumbs[0] === '/'
    }, '面包屑更新', { timeout: 4000 })
    // 二级目录
    await page.locator('.wf-filetree-item', { hasText: 'api.md' }).click()
    await page.waitForFunction(() => !!document.querySelector('.wf-filetree-editor-area'), '文件编辑态', { timeout: 4000 })
    // 返回列表
    await page.locator('.wf-filetree-editor-head button', { hasText: '返回列表' }).click()
    await page.waitForFunction(() => !!document.querySelector('.wf-filetree-list'), '返回列表', { timeout: 4000 })
  } finally { await page.close() }
})

test('能力：文件编辑保存（编辑内容 → 保存 → 回列表）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.locator('.wf-filetree-item', { hasText: 'README.md' }).click()
    await page.waitForFunction(() => !!document.querySelector('.wf-filetree-editor-area'), '编辑态', { timeout: 4000 })
    const area = page.locator('.wf-filetree-editor-area')
    const v1 = await area.inputValue()
    assert.ok(v1.includes('answer'), `编辑内容初始（实际: ${v1.slice(0, 30)}）`)
    await area.fill('// 新内容\nconst x = 1')
    await page.locator('.wf-filetree-editor-head button', { hasText: '保存' }).click()
    // 保存中 → 回列表（demo 400ms 后回列表）
    await page.waitForFunction(() => !!document.querySelector('.wf-filetree-list'), '保存后回列表', { timeout: 4000 })
  } finally { await page.close() }
})

test('能力：上传按钮触发文件选择（input 存在）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    const input = page.locator('.wf-filetree input[type="file"]')
    assert.ok(await input.count() > 0, '上传 input')
    await input.setInputFiles({ name: 'up.txt', mimeType: 'text/plain', buffer: Buffer.from('up') })
    // 无崩溃（demo onUpload 为空操作——零错误已由 open 断言）
    await page.waitForTimeout(300)
  } finally { await page.close() }
})
