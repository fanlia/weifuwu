/**
 * showcase 组件测试——Drawer（/components/drawer）——完整能力
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-drawer.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, assertPopupGeometry, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/drawer'

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

test('渲染零错误 + 右侧抽屉（title+footer+内容）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.locator('main .wf-surface button', { hasText: '右侧抽屉' }).first().click()
    await waitFor(page, () => Promise.resolve((document.body.textContent ?? '').includes('编辑用户')), '抽屉出现')
    assert.ok(await page.evaluate(() => (document.body.textContent ?? '').includes('保存')), 'footer 操作')
    assert.ok(await page.evaluate(() => !!document.querySelector('#__wf_portal input[placeholder="请输入姓名"]')), '表单内容（placeholder 属性）')
  } finally { await page.close() }
})

test('能力：关闭（取消）→ 移除；左侧抽屉打开', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.locator('main .wf-surface button', { hasText: '右侧抽屉' }).first().click()
    await waitFor(page, () => Promise.resolve((document.body.textContent ?? '').includes('编辑用户')), '抽屉出现')
    await page.locator('#__wf_portal button', { hasText: '取消' }).first().click()
    await waitFor(page, () => Promise.resolve(!(document.body.textContent ?? '').includes('编辑用户')), '关闭')
    // **portal 零残留（卸载清理语义——关闭后 #__wf_portal 无 Drawer 内容）**
    assert.equal(await page.locator('#__wf_portal [class*="drawer"]').count(), 0, '关闭后 portal 无抽屉内容')
    // 左侧抽屉
    await page.locator('main .wf-surface button', { hasText: '左侧抽屉' }).first().click()
    await waitFor(page, () => Promise.resolve((document.body.textContent ?? '').includes('导航菜单')), '左侧抽屉')
    assert.ok(await page.evaluate(() => (document.body.textContent ?? '').includes('左侧面板内容')), '左侧内容')
  } finally { await page.close() }
})
test('位置：portal 归属 + fixed + 视口内 + 右侧抽屉', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    
    await page.locator('main .wf-surface button', { hasText: '右侧抽屉' }).first().click()
    await assertPopupGeometry(page, { panelText: '编辑用户' })
  } finally { await page.close() }
})
