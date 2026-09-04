/**
 * 角色旅程测试（角色走查 2027-10 固化——与 roles.test 能力矩阵互补）
 *
 * roles.test 锁「能力边界」（谁能做什么 403 矩阵）；本文件锁「价值流程」——
 * 每个角色的端到端工作线不断裂（走查实证：member 闭环是产品立得住的价值，
 * owner 审批是 HITL 核心，viewer 只读跟进是合理配角）：
 *
 * - owner：工作台审批 CTA → 审批页 → 批准 → toast（HITL 核心旅程）
 * - member：发消息 → AI 干活（wf 注入确定性——不走真 LLM）→ 产物卡片 →
 *   交付物页可见 → 下载 200（「放文件、@AI 干活、拿交付物」核心主张闭环）
 * - viewer：部门消息可读 → 发送被拒（现状 toast「发送失败」——P0 改进时
 *   更新为前置禁用+原因透出）→ 交付物可下载（只读可下载——设计意图）
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, type Browser } from 'playwright'
import {
  startAgentServer, openAgentPage, registerTenant, injectAuth, apiAs,
  seedRoleMember, fatalErrors,
  type AgentServer, type TenantAuth,
  testDb,
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
  owner = await registerTenant(BASE, 'journey')
  const dept = await apiAs(BASE, owner, '/api/departments', { method: 'POST', body: JSON.stringify({ name: '旅程部门' }) })
  deptId = dept.department.id
  await apiAs(BASE, owner, '/api/agents', {
    method: 'POST', body: JSON.stringify({ type: 'ai', name: '旅程AI', system_prompt: 'x' }),
  })
})

test.after(async () => {
  await browser?.close()
  server?.stop()
})

/** 把角色的 user agent 加入部门成员（发消息/读消息前置——roles.test 同模式） */
async function joinDept(role: TenantAuth): Promise<void> {
  const ua = await apiAs(BASE, owner, '/api/agents')
  const agent = (ua?.agents ?? []).find((a: any) => a.type === 'user' && a.user_id === role.user!.id)
  assert.ok(agent, `${role.app.role} 应有 user agent（join 自动创建）`)
  await apiAs(BASE, owner, `/api/departments/${deptId}/members`, {
    method: 'POST', body: JSON.stringify({ agent_id: agent.id, role: 'member' }),
  })
}

/** wf 事件注入（WF_TEST_HOOKS=1——chat.test 同管道——确定性不走真 LLM） */
async function injectWf(room: string, events: unknown[]): Promise<void> {
  const r = await fetch(`${BASE}/api/test/wf`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ room, events }),
  })
  if (!r.ok) throw new Error(`wf 注入失败: ${await r.text()}`)
}

/** UI 发消息（输入框 + 点发送——走查同操作路径） */
async function sendViaUi(page: import('playwright').Page, text: string): Promise<void> {
  await page.evaluate((t) => {
    const input = document.querySelector('input[placeholder*="输入消息"]') as HTMLInputElement
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    setter.call(input, t)
    input.dispatchEvent(new Event('input', { bubbles: true }))
    const btn = [...document.querySelectorAll('button')].find((b) => (b.textContent ?? '').includes('发送'))
    btn?.click()
  }, text)
}

test('owner 旅程：工作台审批 CTA → 审批页 → 批准 → toast「已批准发布」', async () => {
  // 种子待审草稿（approval-badge 先例——SQL 直插）
  const { postgres } = await import('weifuwu')
  const pg = testDb(BASE)
  try {
    const [aiAgent] = await pg.sql`
      SELECT id FROM agents WHERE app_id = ${owner.app.id} AND type = 'ai' LIMIT 1`
    await pg.sql`
      INSERT INTO messages (department_id, sender_id, content, msg_type, ai_draft, ai_approved)
      VALUES (${deptId}, ${aiAgent.id}, '旅程草稿正文', 'text', '旅程待审草稿内容', NULL)
    `
  } finally { await pg.close() }

  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  await injectAuth(page, owner)
  const errors = await openAgentPage(page, BASE, '/')
  // 工作台 CTA（审批徽章驱动——owner 的 HITL 入口；可点击 Card 非 button——走查 snapshot 误标 button 实证）
  await page.waitForFunction(() => (document.body.textContent ?? '').includes('AI 草稿待你批准发布'), undefined, { timeout: 10_000 })
  await page.locator('.wf-card', { hasText: 'AI 草稿待你批准发布' }).first().click()
  await page.waitForURL(/\/approvals/, { timeout: 10_000 })
  await page.waitForFunction(() => (document.body.textContent ?? '').includes('旅程待审草稿内容'), undefined, { timeout: 10_000 })
  // 四操作齐备（去聊天/编辑草稿/拒绝/批准）
  const actions = await page.evaluate(() => ({
    approve: [...document.querySelectorAll('button')].some((b) => /^\s*批准\s*$/.test((b.textContent ?? '').trim())), // 精确（排除批量按钮）
    reject: [...document.querySelectorAll('button')].some((b) => (b.textContent ?? '').includes('拒绝')),
    edit: [...document.querySelectorAll('button')].some((b) => (b.textContent ?? '').includes('编辑草稿')),
  }))
  assert.ok(actions.approve && actions.reject && actions.edit, `审批操作应齐备（实际：${JSON.stringify(actions)}）`)
  // 批准 → toast「已批准发布」（locator hasText 精确匹配行内批准——page.click 的 options 无 hasText 会静默忽略→strict 多匹配吞错 实证）
  await page.locator('button', { hasText: /^\s*批准\s*$/ }).first().click()
  await page.waitForFunction(() => (document.body.textContent ?? '').includes('已批准发布'), undefined, { timeout: 8000 })
  assert.ok(fatalErrors(errors).length === 0, `零页面错误: ${errors.join(' | ')}`)
  await page.close()
})

test('member 旅程：发消息 → AI 干活（wf 注入）→ 产物卡片 → 交付物页 → 下载 200', async () => {
  const member = await seedRoleMember(BASE, owner, 'member')
  await joinDept(member)

  // 真文件落盘（交付物列表是真实扫盘——wf 注入只驱动 UI 事件）
  const wsDir = join(process.cwd(), 'data', 'workspaces', deptId)
  mkdirSync(wsDir, { recursive: true })
  writeFileSync(join(wsDir, 'journey.txt'), 'member 旅程产物')

  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  await injectAuth(page, member)
  const errors = await openAgentPage(page, BASE, `/chat/${deptId}`)
  await page.waitForFunction(() => !!document.querySelector('input[placeholder*="输入消息"]'), undefined, { timeout: 10_000 })
  await sendViaUi(page, '@旅程AI 帮我生成 journey.txt')
  // 自己的消息上屏（发送成功——member 写权限 ✓）
  await page.waitForFunction(() => (document.body.textContent ?? '').includes('帮我生成 journey.txt'), undefined, { timeout: 10_000 })
  // AI 干活（wf 注入——工具步骤 + 完成 + 产物卡片）
  await injectWf(deptId, [
    { type: 'wf:step', messageId: `jn-${Date.now()}`, agentId: 'ai-journey', agentName: '旅程AI', stepType: 'tool', name: 'write', args: '{"path":"journey.txt"}' },
    { type: 'wf:tool_result', messageId: `jn-${Date.now()}`, toolResult: 'OK' },
    { type: 'wf:done', messageId: `jn-${Date.now()}`, content: '✅ 已创建 journey.txt', agentId: 'ai-journey', agentName: '旅程AI' },
    { type: 'file_updated', file: '/ws/journey.txt', agentId: 'ai-journey', agentName: '旅程AI' },
  ])
  // 产物卡片出现（聊天流内「AI 刚生成了」）
  await page.waitForFunction(() => (document.body.textContent ?? '').includes('journey.txt'), undefined, { timeout: 10_000 })
  // 交付物页可见（价值闭环最后一环）
  await page.goto(`${BASE}/deliverables`, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => (document.body.textContent ?? '').includes('journey.txt'), undefined, { timeout: 10_000 })
  // 下载 API 200（带鉴权下载链路——member 读自己部门交付物）
  const dl = await fetch(`${BASE}/api/departments/${deptId}/workspace/file?path=journey.txt&download=1`, {
    headers: { Authorization: `Bearer ${member.token}` },
  })
  assert.equal(dl.status, 200, `member 下载交付物应 200（实际 ${dl.status}）`)
  assert.ok((await dl.text()).includes('member 旅程产物'), '下载内容应正确')
  assert.ok(fatalErrors(errors).length === 0, `零页面错误: ${errors.join(' | ')}`)
  await page.close()
})

test('viewer 旅程：部门消息可读 → 输入框前置禁用（波次 2）→ 交付物可下载（只读可下载）', async () => {
  const viewer = await seedRoleMember(BASE, owner, 'viewer')
  await joinDept(viewer) // 加部门成员——只读可读消息（读面）
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  await injectAuth(page, viewer)
  const errors = await openAgentPage(page, BASE, `/chat/${deptId}`)
  // 读面：部门消息可见（member 旅程发的消息在流里）
  await page.waitForFunction(() => (document.body.textContent ?? '').includes('帮我生成 journey.txt'), undefined, { timeout: 10_000 })
  // 写面前置禁用（ROLES-OPTIMIZATION 波次 2 落地——原「可打字→发送失败」形态
  // 升级为「输入框禁用 + placeholder 引导」——API requireWriter 服务端兵底）。
  // 注意：ChatInput 默认单行 input（textarea 仅 multiline）——选择器不能只查 textarea
  const writeFace = await page.evaluate(() => {
    const input = (document.querySelector('input[placeholder*="输入消息"], input[placeholder*="只读成员"], textarea') ?? null) as HTMLInputElement | null
    return {
      tag: input?.tagName ?? 'none',
      disabled: input?.disabled ?? false,
      placeholder: input?.getAttribute('placeholder') ?? '',
    }
  })
  assert.equal(writeFace.disabled, true, `viewer 聊天输入框前置禁用（波次 2——tag=${writeFace.tag} ph=${writeFace.placeholder}）`)
  assert.ok(writeFace.placeholder.includes('只读成员'), `placeholder 引导原因（实际：${writeFace.placeholder}）`)
  const notInStream = await page.evaluate(() => {
    const msgs = [...document.querySelectorAll('[data-msgid]')]
    return !msgs.some((m) => (m.textContent ?? '').includes('viewer 尝试发言'))
  })
  assert.ok(notInStream, 'viewer 无法通过 UI 发言（禁用态——消息不产生）')
  // 读面价值：交付物可下载（只读 ≠ 不能拿结果——设计意图锁定）
  const dl = await fetch(`${BASE}/api/departments/${deptId}/workspace/file?path=journey.txt&download=1`, {
    headers: { Authorization: `Bearer ${viewer.token}` },
  })
  assert.equal(dl.status, 200, `viewer 下载交付物应 200（只读可下载——设计意图；实际 ${dl.status}）`)
  assert.ok(fatalErrors(errors).length === 0, `零页面错误: ${errors.join(' | ')}`)
  await page.close()
})
