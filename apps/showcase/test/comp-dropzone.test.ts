/**
 * showcase 组件测试——DropZone（/components/dropzone）——全区域拖放
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-dropzone.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/dropzone'

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

test('渲染零错误 + 容器存在', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    const exists = await page.evaluate(() => !!document.querySelector('.wf-drop-zone'))
    assert.ok(exists, 'DropZone 容器渲染')
  } finally { await page.close() }
})

test('能力：拖入文件 → 高亮 + onFiles 回调（drop → 文件名单更新）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    const result = await page.evaluate(() => {
      const zone = document.querySelector('.wf-drop-zone')
      if (!zone) return { err: 'no zone' }
      const dt = new DataTransfer()
      dt.items.add(new File(['hello'], 'note.txt', { type: 'text/plain' }))
      const ev = (type: string) => new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt })
      zone.dispatchEvent(ev('dragenter'))
      const outlineDuring = (zone as HTMLElement).style.outline
      zone.dispatchEvent(ev('dragover'))
      zone.dispatchEvent(ev('drop'))
      const outlineAfter = (zone as HTMLElement).style.outline
      return { outlineDuring, outlineAfter }
    })
    assert.ok(!result.err, result.err ?? '')
    assert.ok(String(result.outlineDuring).includes('dashed'), '拖入高亮（实际: ' + result.outlineDuring + '）')
    assert.equal(result.outlineAfter, '', 'drop 后高亮清除')
    await page.waitForTimeout(100)
    const txt = await page.evaluate(() => document.body.textContent ?? '')
    assert.ok(txt.includes('已拖入：note.txt'), 'onFiles 回调（文件名单更新）')
  } finally { await page.close() }
})
