/**
 * 聊天流 AI 生成图片直显（2026-09）
 *
 * 全链（无 LLM）：SQL 直插 AI 消息（content 含 /ws/t.png）→ 聊天页
 * → hydrateImagePreviews 提取路径 → 带 token 拉图 → blob URL 挂 preview
 * → MessageItem 渲染 <img>（alt="AI 生成图片"）
 *
 * 锁定：图片在消息流中直接显示（非仅文本路径）——交付物中心外第二条路径
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

// 1x1 合法 PNG（img decode 兜底——fetch/render 链路真实）
const PNG_1x1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64')

let server: AgentServer
let browser: Browser
let BASE = ''
let owner: TenantAuth
let pg: ReturnType<typeof postgres>

test.before(async () => {
  server = await startAgentServer()
  BASE = server.base
  browser = await chromium.launch()
  owner = await registerTenant(BASE, 'imgprev')
  pg = postgres(process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL, { max: 2, closeTimeout: 1 })
  // 部门 + AI agent + 工作区图片 + AI 消息（content 含 /ws/ 路径——工具实际回复形态）
  const dept = await apiAs(BASE, owner, '/api/departments', { method: 'POST', body: JSON.stringify({ name: '图像组' }) })
  const agent = await apiAs(BASE, owner, '/api/agents', { method: 'POST', body: JSON.stringify({ type: 'ai', name: '画师', model: 'deepseek-v4-flash', description: '画图' }) })
  await apiAs(BASE, owner, `/api/departments/${dept.department.id}/members`, { method: 'POST', body: JSON.stringify({ agent_id: agent.agent.id, role: 'member' }) })
  await mkdir(join(resolve(process.cwd(), 'data/workspaces'), dept.department.id), { recursive: true })
  await writeFile(join(resolve(process.cwd(), 'data/workspaces'), dept.department.id, 't.png'), PNG_1x1)
  await pg.sql`
    INSERT INTO messages (department_id, sender_id, content, msg_type)
    VALUES (${dept.department.id}, ${agent.agent.id},
      '海报已生成：/ws/t.png（已存入部门共享目录，交付物中心可见）', 'text')
  `
  ;(globalThis as any).__imgPrev = { deptId: dept.department.id }
})

test.after(async () => {
  await browser?.close()
  await pg.close()
  server?.stop()
})

test('聊天流直显：AI 回复含 /ws 图片路径 → img 渲染（blob 预览 + 点击可放大）', async () => {
  const { deptId } = (globalThis as any).__imgPrev
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  await injectAuth(page, owner)
  const errors = await openAgentPage(page, BASE, `/chat/${deptId}`)
  // 链路：页面加载消息 → 提取 /ws/t.png → 带 token 拉图 → blob → <img>
  await page.waitForSelector('img[alt="AI 生成图片"]', { timeout: 15_000 })
  const src = await page.getAttribute('img[alt="AI 生成图片"]', 'src')
  assert.ok(src?.startsWith('blob:'), `预览为 blob URL——src=${src?.slice(0, 60)}`)
  // 2026-09 agent-browser 实证：blob 存在但内容为 JSON（无 download=1）→ decode 失败——
  // 断言 naturalWidth>0（真实解码成功——破图必挂）
  await page.waitForFunction(() => {
    const el = document.querySelector('img[alt="AI 生成图片"]') as HTMLImageElement | null
    return !!el && el.naturalWidth > 0
  }, undefined, { timeout: 10_000 })
  // 点击放大 → Img 组件 preview（openPopup 遮罩预览——页面内浮层）浮层图片出现
  await page.click('button[aria-label="放大预览"]')
  await page.waitForSelector('.wf-img-preview-image', { timeout: 10_000 })
  await page.waitForFunction(() => {
    const el = document.querySelector('.wf-img-preview-image') as HTMLImageElement | null
    return !!el && el.naturalWidth > 0
  }, undefined, { timeout: 10_000 })
  // Escape 关闭预览浮层
  await page.keyboard.press('Escape')
  await page.waitForSelector('.wf-img-preview-image', { state: 'detached', timeout: 5_000 })
  assert.deepEqual(fatalErrors(errors), [], `页面零错误——发现: ${errors.join(' | ')}`)
  await page.close()
})
