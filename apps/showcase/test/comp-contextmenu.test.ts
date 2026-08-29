/**
 * showcase 组件测试——ContextMenu（/components/overlay/contextmenu）——完整能力
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-contextmenu.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, assertPopupGeometry, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/overlay/contextmenu'

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

test('能力：右键出现菜单 + 项点击（编辑/复制/删除——danger）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    // 右键（contextmenu 事件——精确 wrap 类名——避免文档区误命中）
    const box = await page.locator('main .wf-context-menu-trigger').first().boundingBox()
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: 'right' })
    await waitFor(page, () => Promise.resolve(!!document.querySelector('#__wf_portal [class*="context-menu"], #__wf_portal [role="menu"]')), '右键菜单', 3000)
    assert.ok(await page.evaluate(() => (document.body.textContent ?? '').includes('删除')), '菜单项（含 danger）')
    // 点「复制」→ 菜单关闭（portal 无残留——文档区可能含'编辑'文字——portal 检查）
    await page.locator('#__wf_portal button, .wf-popup button', { hasText: '复制' }).first().click()
    await waitFor(page, () => Promise.resolve(!document.querySelector('#__wf_portal [class*="context-menu"]')), '选择后关闭（portal 菜单移除）')
  } finally { await page.close() }
})
test('位置：portal 归属 + fixed + 视口内 + 跟随光标（右键坐标——无 anchor 的 position 定位）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    
    const box = await page.locator('main .wf-context-menu-trigger').first().boundingBox()
    const cx = box.x + box.width / 2
    const cy = box.y + box.height / 2
    await page.mouse.click(cx, cy, { button: 'right' })
    // **位置必须跟随光标（2027-09 回归——旧序 position 被无 anchor 卡死→左上角 0,0）**
    const mb = await page.locator('#__wf_portal .wf-context-menu').boundingBox()
    assert.ok(Math.abs(mb.x - cx) <= 4, `菜单 x 跟随光标（期望≈${cx}，实际 ${mb.x}）`)
    assert.ok(Math.abs(mb.y - cy) <= 4, `菜单 y 跟随光标（期望≈${cy}，实际 ${mb.y}）`)
    await assertPopupGeometry(page, { panelText: '复制', transformNone: true })
  } finally { await page.close() }
})
