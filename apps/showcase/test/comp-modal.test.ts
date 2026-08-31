/**
 * showcase 组件测试——Modal（/components/modal）——完整能力
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-modal.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, assertPopupGeometry, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/modal'

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

test('渲染零错误 + 打开弹窗（遮罩+标题+内容）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.locator('main .wf-surface button', { hasText: '打开弹窗' }).first().click()
    await waitFor(page, () => Promise.resolve((document.body.textContent ?? '').includes('确认操作')), '弹窗出现')
    assert.ok(await page.evaluate(() => !!document.querySelector('.wf-modal-overlay')), '遮罩（wf-modal-overlay）')
    assert.ok(await page.evaluate(() => (document.body.textContent ?? '').includes('这是弹窗内容')), '内容')
  } finally { await page.close() }
})

test('能力：关闭（确定按钮）→ 弹窗移除 + portal 无残留（核心层修复验证）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.locator('main .wf-surface button', { hasText: '打开弹窗' }).first().click()
    await waitFor(page, () => Promise.resolve((document.body.textContent ?? '').includes('确认操作')), '弹窗出现')
    await page.locator('#__wf_portal button, .wf-popup-mask button', { hasText: '确定' }).first().click()
    await waitFor(page, () => Promise.resolve(!(document.body.textContent ?? '').includes('确认操作')), '弹窗关闭')
    // 核心层修复：portal 容器无残留（混合数组 unkeyed 移除——removePortal）
    const residual = await page.evaluate(() => {
      const p = document.querySelector('#__wf_portal')
      return p ? p.textContent?.includes('确认操作') ?? false : false
    })
    assert.ok(!residual, 'portal 无残留')
  } finally { await page.close() }
})
test('位置：portal 归属 + fixed + 视口内 + 居中弹窗', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    
    await page.locator('main .wf-surface button', { hasText: '打开弹窗' }).first().click()
    await assertPopupGeometry(page, { centered: true })
  } finally { await page.close() }
})
