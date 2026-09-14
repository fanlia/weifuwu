/**
 * 打磨波测试（UX-PLAN-2 波次 5 防线）——C1 搜索归位 + C2 报表单位
 *
 * 实证：
 * - C1：聊天搜索框原在页面底部（输入框下方）——IM 惯例在头部；底部位置
 *   首次使用者不可发现
 * - C2：报表部门用量行「6.3k」无单位标注——tokens 与消息/运行并排扫读困难
 * - C4 无 key 警告：全新会话 11 页 × 双视口猎捕零警告（Workspace 问候行
 *   补 key——fixed by wave 5；防线 = 既有页面 console 零错误红线测试）
 *
 * 锁定契约：
 * - 头部搜索开关 → 搜索行出现（头部下方）→ Enter 执行（badge 出现）→ 关闭收起
 * - 底部不再有常驻搜索行
 * - 报表 tokens 值带单位后缀
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import {
  startAgentServer, openAgentPage, registerTenant, injectAuth, apiAs, fatalErrors,
  waitForBodyText,
  type AgentServer, type TenantAuth,
} from './shared.ts'

let server: AgentServer
let browser: Browser
let BASE = ''
let owner: TenantAuth
let deptId = ''

test.before(async () => {
  server = await startAgentServer()
  BASE = server.base
  browser = await chromium.launch()
  owner = await registerTenant(BASE, 'polish')
  const dept = await apiAs(BASE, owner, '/api/departments', { method: 'POST', body: JSON.stringify({ name: '打磨部门' }) })
  deptId = dept.department.id
})

test.after(async () => {
  await browser?.close()
  server?.stop()
})

test('C1：搜索开关在头部 → 展开搜索行 → Enter 执行（badge）→ 关闭收起', async () => {
  const page = await browser.newPage()
  await injectAuth(page, owner)
  const errors = await openAgentPage(page, BASE, `/chat/${deptId}`)
  await waitForBodyText(page, '打磨部门')
  // 底部无常驻搜索行（旧形态回归红线：输入区下不应再有搜索输入）
  const bottomSearch = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('div.wf-row')]
    return rows.some((r) => {
      const input = r.querySelector('input[placeholder="搜索消息..."]')
      if (!input) return false
      // 搜索行若存在必须在中栏头部（前一个兄弟是头部行而非发送行）
      const rect = r.getBoundingClientRect()
      const sendBtn = [...document.querySelectorAll('button')].find((b) => b.textContent?.includes('发送'))
      const sendRect = sendBtn?.getBoundingClientRect()
      return sendRect ? rect.top > sendRect.top : false
    })
  })
  assert.ok(!bottomSearch, '底部不应有常驻搜索行（C1 回归）')
  // 头部开关 → 展开
  await page.click('button[title*="搜索归位头部"]')
  await page.waitForSelector('input[placeholder="搜索消息..."]', { timeout: 5000 })
  // 输入 + Enter 执行 → badge 出现
  await page.fill('input[placeholder="搜索消息..."]', '打磨')
  await page.press('input[placeholder="搜索消息..."]', 'Enter')
  await waitForBodyText(page, /搜索：/, 10_000)
  // 关闭 → 搜索行收起
  await page.click('button[title="关闭搜索"]')
  await page.waitForFunction(() => !document.querySelector('input[placeholder="搜索消息..."]'), undefined, { timeout: 5000 })
  assert.ok(fatalErrors(errors).length === 0, `页面零错误红线: ${errors.join(' | ')}`)
  await page.close()
})

test('C2：报表部门用量 tokens 带单位后缀（可扫读）', async () => {
  const page = await browser.newPage()
  await injectAuth(page, owner)
  const errors = await openAgentPage(page, BASE, '/reports')
  await waitForBodyText(page, '项目空间用量')
  // 有消息的部门行应有「Nk tokens」形态（本租户新——0.0k 也带单位）
  const hasUnit = await page.evaluate(() => {
    const hits = [...document.querySelectorAll('*')].filter((e) => e.children.length === 0 && /^\d+(\.\d+)?k tokens$/.test((e.textContent ?? '').trim()))
    return hits.length > 0
  })
  assert.ok(hasUnit, '报表 tokens 值应带单位后缀（N.Nk tokens）')
  assert.ok(fatalErrors(errors).length === 0, `页面零错误红线: ${errors.join(' | ')}`)
  await page.close()
})
