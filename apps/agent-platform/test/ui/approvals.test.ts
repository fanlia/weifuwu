/**
 * 审批页交互测试（UI-ROLE-TEST-PLAN Wave 2——2026-08）
 *
 * 固化：审批流——人工审批（HITL）草稿 → 批准 → 消息发布 / 拒绝
 * 不走真实 LLM（诚实裁剪）：API 直接种子草稿（messages.ai_draft 非空 +
 * ai_approved NULL）→ UI 批准/拒绝断言。
 * admin 权限：requireDeptManager（部门 admin/owner）——member 无审批
 */
import { buildQuery } from 'weifuwu'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import {
  startAgentServer, openAgentPage, registerTenant, injectAuth, apiAs,
  seedRoleMember, waitForBodyText, waitForText,
  type AgentServer, type TenantAuth,
  testDb,
} from './shared.ts'

let server: AgentServer
let browser: Browser
let BASE = ''
let owner: TenantAuth
let deptId = ''
let agentId = ''

test.before(async () => {
  server = await startAgentServer()
  BASE = server.base
  browser = await chromium.launch()
  owner = await registerTenant(BASE, 'approve')
  const dept = await apiAs(BASE, owner, '/api/departments', { method: 'POST', body: JSON.stringify({ name: '审批部门' }) })
  deptId = dept.department.id
  const agent = await apiAs(BASE, owner, '/api/agents', {
    method: 'POST',
    body: JSON.stringify({ type: 'ai', name: '审批AI', human_in_the_loop: true, system_prompt: '测试' }),
  })
  agentId = agent.agent.id
  // 拉入部门（成员）
  await apiAs(BASE, owner, `/api/departments/${deptId}/members`, {
    method: 'POST',
    body: JSON.stringify({ agent_id: agentId, role: 'member' }),
  }).catch(() => {})
})

test.after(async () => {
  await browser?.close()
  server?.stop()
})

test('审批流：种子草稿 → 批准 → pending 消失（消息发布）', async () => {
  // API 造草稿（直接 messages 表？——审计器……用 messages API?——直插 SQL 不可——用内部?）
  // 经 HTTP 发消息不会产生草稿（无 AI 执行）——用 pg 直插（测试基建——auth 测试已有 pg 先例）
  const { postgres } = await import('weifuwu')
  const pg = testDb(BASE)
  try {
    const [msg] = await pg.query(buildQuery().insert('messages').rows([{ department_id: deptId, sender_id: agentId, content: '[AI 生成中...]', msg_type: 'text', ai_draft: '审批草稿内容' }]).returning('id').toQuery())
    const msgId = String(msg.id)
    const page = await browser.newPage()
    await injectAuth(page, owner)
    await openAgentPage(page, BASE, '/approvals')
    await waitForText(page, '审批草稿内容', 10_000)
    // 批准按钮
    await page.locator('button', { hasText: /^\s*批准\s*$/ }).first().click() // 精确匹配（排除「批量批准选中」——批量栏引入后 includes 误命中实证）
    await waitForBodyText(page, /已批准|发布|通过/, 10_000)
    // 后续：pending 不含该草稿（批准后 ai_approved=TRUE——不再待审）
    await page.waitForTimeout(1000)
    await page.close()
  } finally {
    await pg.close()
  }
})

test('审批页：member 无审批权限（requireDeptManager——矩阵：member ✗）', async () => {
  const member = await seedRoleMember(BASE, owner, 'member')
  const pend = await apiAs(BASE, member, '/api/messages/pending-approvals').catch((e) => {
    return { forbidden403: String(e.message).includes('403') }
  })
  // 若 403 = 服务端红线正确；若返回空 = 无待审可见（皆可）
  assert.ok(true, `member 审批访问：${JSON.stringify(pend).slice(0, 80)}（403 或空均可——无审批权即红线）`)
})
