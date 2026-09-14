/**
 * 全路由冒烟（ROADMAP 验收「冒烟零回归」——OPTIMIZE-PLAN-3 补网）
 *
 * 形态：单 server + 单租户 + 单浏览器会话——顺序打开全部页面路由——
 * 每页断言：#root 渲染 + 零 console.error/pageerror（页面零错误红线）。
 * 参数化路由（/chat/:id、/departments/:id）由 pages.test.ts 基线覆盖——
 * 此处只扫静态路由（含 /agents/:id 种子 Agent——详情页代表）。
 *
 * 单独运行：node --env-file=.env --test apps/agent-platform/test/ui/smoke.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import {
  startAgentServer, openAgentPage, fatalErrors,
  registerTenant, injectAuth, apiAs,
  type AgentServer, type TenantAuth,
} from './shared.ts'

let server: AgentServer
let browser: Browser
let BASE = ''
let auth: TenantAuth
let agentId = ''

/** 静态路由（认证态——AppLayout 包裹的全部页面） */
const PAGES = [
  '/', '/dashboard', '/reports', '/deliverables',
  '/agents', '/agents/new', '/templates',
  '/departments', '/departments/new',
  '/chat/new', '/approvals', '/sandboxes', '/settings', '/admin',
]

test.before(async () => {
  server = await startAgentServer()
  BASE = server.base
  browser = await chromium.launch()
  auth = await registerTenant(BASE, 'smoke')
  const agent = await apiAs(BASE, auth, '/api/agents', {
    method: 'POST',
    body: JSON.stringify({ type: 'ai', name: '冒烟 Agent', system_prompt: '你是冒烟助手' }),
  })
  agentId = agent.agent.id
})

test.after(async () => {
  await browser?.close()
  server?.stop()
})

test('全路由冒烟：静态页 + 详情页——渲染 + 零 console 错误', async () => {
  const page = await browser.newPage()
  try {
    await injectAuth(page, auth)
    const failures: string[] = []
    for (const path of [...PAGES, `/agents/${agentId}`]) {
      const errors = await openAgentPage(page, BASE, path)
      const fatal = fatalErrors(errors)
      if (fatal.length > 0) failures.push(`${path}: ${fatal[0]}`)
    }
    assert.deepEqual(failures, [], `全部页面零错误（失败: ${failures.join(' | ')}）`)
  } finally { await page.close() }
})

test('未登录守卫：无 token 访问受保护页 → 认证跳转（不白屏）', async () => {
  // 新浏览器上下文（无 localStorage——模拟未登录直达）
  const ctx = await browser.newContext()
  const page = await ctx.newPage()
  try {
    await page.goto(`${BASE}/settings`, { waitUntil: 'domcontentloaded', timeout: 15_000 })
    // 认证守卫：401 → 跳登录页（硬跳转或 SPA 导航——终态 = /login 可见表单）
    await page.waitForURL(/\/login/, { timeout: 10_000 })
    assert.ok(page.url().includes('/login'), '终态落在登录页')
  } finally { await ctx.close() }
})
