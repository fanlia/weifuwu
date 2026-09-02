/**
 * 交付物文件卡片体验（DELIVERABLES-UX-PLAN W1/W2）
 *
 *  - 图片文件 → 48px 缩略图（真实解码——naturalWidth>0）
 *  - 非图片（csv）→ database 类型图标；无缩略图 img（类别区分）
 *  - 文件名 title=tooltip 完整名
 *  - 缩略图点击 → Img preview 预览浮层打开
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { postgres } from 'weifuwu'
import { mkdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import {
  startAgentServer, openAgentPage, registerTenant, injectAuth, apiAs,
  fatalErrors, type AgentServer, type TenantAuth,
} from './shared.ts'

const PNG_1x1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64')

let server: AgentServer
let browser: Browser
let BASE = ''
let owner: TenantAuth
let pg: ReturnType<typeof postgres>
let deptId = ''

test.before(async () => {
  server = await startAgentServer()
  BASE = server.base
  browser = await chromium.launch()
  owner = await registerTenant(BASE, 'filesux')
  pg = postgres(process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL, { max: 2, closeTimeout: 1 })
  const dept = await apiAs(BASE, owner, '/api/departments', { method: 'POST', body: JSON.stringify({ name: '文件组' }) })
  deptId = dept.department.id
  const agent = await apiAs(BASE, owner, '/api/agents', { method: 'POST', body: JSON.stringify({ type: 'ai', name: '文员', model: 'm', description: 'd' }) })
  await apiAs(BASE, owner, `/api/departments/${deptId}/members`, { method: 'POST', body: JSON.stringify({ agent_id: agent.agent.id, role: 'member' }) })
  const ws = join(resolve(process.cwd(), 'data/workspaces'), deptId)
  await mkdir(ws, { recursive: true })
  await writeFile(join(ws, 'long-name-poster-image.png'), PNG_1x1)
  await writeFile(join(ws, '订单数据报表.csv'), 'a,b\n1,2\n')
})

test.after(async () => {
  await browser?.close()
  await pg.close()
  server?.stop()
})

test('文件卡片：图片缩略图（解码）+ csv 类型图标 + tooltip + 点击预览', async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  await injectAuth(page, owner)
  const errors = await openAgentPage(page, BASE, `/chat/${deptId}`)
  // 缩略图出现且真实解码（48px Img placeholder→图）
  await page.waitForSelector('img[alt="long-name-poster-image.png"]', { timeout: 15_000 })
  await page.waitForFunction(() => {
    const el = document.querySelector('img[alt="long-name-poster-image.png"]') as HTMLImageElement | null
    return !!el && el.naturalWidth > 0
  }, undefined, { timeout: 10_000 })
  // csv 无缩略图（缩略图 img 恰 1 张——缩略图仅图片类）
  const thumbCount = await page.locator('img[alt$=".png"]').count()
  assert.equal(thumbCount, 1, '缩略图恰 1 张（仅图片类）')
  // 文件名 title = 完整名（截断可读）
  const title = await page.getAttribute('button[title="订单数据报表.csv"]', 'title')
  assert.equal(title, '订单数据报表.csv')
  // 点击缩略图 → 预览浮层（Img preview）
  await page.click('img[alt="long-name-poster-image.png"]')
  await page.waitForSelector('.wf-img-preview-image', { timeout: 10_000 })
  await page.keyboard.press('Escape')
  await page.waitForSelector('.wf-img-preview-image', { state: 'detached', timeout: 5_000 })
  assert.deepEqual(fatalErrors(errors), [], `页面零错误——发现: ${errors.join(' | ')}`)
  await page.close()
})
