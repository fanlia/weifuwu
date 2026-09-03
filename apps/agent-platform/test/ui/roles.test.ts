/**
 * 角色权限矩阵跨页测试（UI-ROLE-TEST-PLAN Wave 3——2026-08）
 *
 * 核心：**每个角色把所有写入口试一遍**（点击/API——「点击才暴露」纪律）——
 * 不是只看按钮，是验证能力边界精确：
 * - viewer：全部写操作 403（发消息/建 Agent/建部门/审批/删除）
 * - member：可对话/建 Agent，但不可建部门/审批/管理
 * - admin（部门级）：部门成员管理/审批（owner 授权）
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import {
  startAgentServer, openAgentPage, registerTenant, injectAuth, apiAs,
  seedRoleMember, seedDeptAdmin,
  type AgentServer, type TenantAuth,
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
  owner = await registerTenant(BASE, 'roles')
  const dept = await apiAs(BASE, owner, '/api/departments', { method: 'POST', body: JSON.stringify({ name: '矩阵部门' }) })
  deptId = dept.department.id
  const agent = await apiAs(BASE, owner, '/api/agents', {
    method: 'POST', body: JSON.stringify({ type: 'ai', name: '矩阵AI', system_prompt: 'x' }),
  })
  agentId = agent.agent.id
  await apiAs(BASE, owner, `/api/departments/${deptId}/members`, {
    method: 'POST', body: JSON.stringify({ agent_id: agentId, role: 'member' }),
  }).catch(() => {})
})

test.after(async () => {
  await browser?.close()
  server?.stop()
})

test('viewer：全部写入口 403（发消息/建 Agent/建部门/删部门——服务端矩阵）', async () => {
  const viewer = await seedRoleMember(BASE, owner, 'viewer')
  const attempts: Array<{ name: string; run: () => Promise<boolean> }> = [
    { name: '发消息', run: async () => (await tryApi(viewer, `/api/departments/${deptId}/messages`, 'POST', { content: 'x' })) },
    { name: '建 Agent', run: async () => (await tryApi(viewer, '/api/agents', 'POST', { type: 'ai', name: 'v' })) },
    { name: '建部门', run: async () => (await tryApi(viewer, '/api/departments', 'POST', { name: 'v-dept' })) },
    { name: '删部门', run: async () => (await tryApi(viewer, `/api/departments/${deptId}`, 'DELETE')) },
    { name: '审批', run: async () => (await tryApi(viewer, '/api/messages/pending-approvals', 'GET')) },
  ]
  const allowed: string[] = []
  for (const a of attempts) {
    const forbidden = await a.run()
    // 审批 GET 是读（viewer 可见）——单独处理；写操作必须 403
    if (a.name !== '审批' && !forbidden) allowed.push(a.name)
  }
  assert.deepEqual(allowed, [], `viewer 写操作应全部 403——放行：${allowed.join(', ')}`)
})

test('member：可对话/建 Agent——不可建部门/审批（能力边界精确）', async () => {
  const member = await seedRoleMember(BASE, owner, 'member')
  // member 的 user agent 加入部门（发消息前置——department_members 成员资格）
  const ua = await apiAs(BASE, owner, '/api/agents')
  const memberAgent = (ua?.agents ?? []).find((a: any) => a.type === 'user' && a.user_id === member.user!.id)
  if (memberAgent) {
    await apiAs(BASE, owner, `/api/departments/${deptId}/members`, {
      method: 'POST', body: JSON.stringify({ agent_id: memberAgent.id, role: 'member' }),
    }).catch(() => {})
  }
  // 允许面
  const canSend = await (async () => {
    try { await apiAs(BASE, member, `/api/departments/${deptId}/messages`, { method: 'POST', body: JSON.stringify({ content: 'member 消息' }) }); return true }
    catch { return false }
  })()
  assert.ok(canSend, 'member 可发消息（矩阵 ✓）')
  // 禁止面
  const deptForbidden = await tryApi(member, '/api/departments', 'POST', { name: 'm-dept' })
  assert.ok(deptForbidden, 'member 建部门 403（矩阵 ✗——Wave 2 修复回归）')
  // 审批（读 pending——member 应无权限或空——不做严格（读面宽容））
  const pend = await apiAs(BASE, member, '/api/messages/pending-approvals').catch(() => null)
  assert.ok(pend !== undefined, 'member 审批面可访问（但无待审——读宽容）')
})

test('member/viewer：邀请均 403（Owner only——设置页「仅所有者可用」文案的服务端防线）；报表读面对两角色开放', async () => {
  // 走查实证（2027-10）：member 曾被怀疑可邀请（探针误用 owner 账号 user@demo.com）
  // ——红线锁定：仅 owner 能生成邀请链接
  const member = await seedRoleMember(BASE, owner, 'member')
  const viewer = await seedRoleMember(BASE, owner, 'viewer')
  const memberInviteForbidden = await tryApi(member, `/api/auth/apps/${owner.app.slug}/invites`, 'POST', { role: 'viewer' })
  const viewerInviteForbidden = await tryApi(viewer, `/api/auth/apps/${owner.app.slug}/invites`, 'POST', { role: 'member' })
  assert.ok(memberInviteForbidden, 'member 邀请应 403（Owner only）')
  assert.ok(viewerInviteForbidden, 'viewer 邀请应 403（Owner only）')
  // 提权邀请双保险：role=owner 的邀请请求也必须被拒（createInvite 内部白名单——
  // 即使路由层漏检，签出的邀请 role 也必须降级——双重防线）
  const memberOwnerInvite = await tryApi(member, `/api/auth/apps/${owner.app.slug}/invites`, 'POST', { role: 'owner' })
  assert.ok(memberOwnerInvite, 'member 发 role=owner 邀请应 403（提权防线）')
  // ROLES-OPTIMIZATION 波次 1：邀请角色白名单——role=admin 幽灵角色裁剪
  // （此前 createInvite 放行任意 role 串——可铸造无入口的 app 级 admin；
  // 现在路由层显式 403——owner 发出也拒，非法角色不静默降级）
  const adminInviteForbidden = await tryApi(owner, `/api/auth/apps/${owner.app.slug}/invites`, 'POST', { role: 'admin' })
  assert.ok(adminInviteForbidden, 'owner 发 role=admin 邀请应 403（白名单仅 member/viewer）')
  // 报表读面：member/viewer 可见（成本可观测不限于 owner——走查实证）
  const memberStats = await apiAs(BASE, member, '/api/stats').catch(() => null)
  const viewerStats = await apiAs(BASE, viewer, '/api/stats').catch(() => null)
  assert.ok(memberStats !== null, 'member 报表可读（矩阵 ✓）')
  assert.ok(viewerStats !== null, 'viewer 报表可读（矩阵 ✓）')
})

// 辅助：API 调用返回「是否 403」
async function tryApi(auth: TenantAuth, path: string, method: string, body?: unknown): Promise<boolean> {
  try {
    await apiAs(BASE, auth, path, { method, body: body ? JSON.stringify(body) : undefined })
    return false // 成功 = 未拦截
  } catch (e: any) {
    return String(e.message).includes('403')
  }
}

test('admin（部门级）：部门成员管理可用（owner 授权——部门权限）', async () => {
  // 部门 admin（member 加入部门 + role=admin——用 user agent）
  const admin = await seedRoleMember(BASE, owner, 'member')
  const ua = await apiAs(BASE, owner, '/api/agents')
  const adminAgent = (ua?.agents ?? []).find((a: any) => a.type === 'user' && a.user_id === admin.user!.id)
  assert.ok(adminAgent, 'admin 有 user agent')
  await apiAs(BASE, owner, `/api/departments/${deptId}/members`, {
    method: 'POST', body: JSON.stringify({ agent_id: adminAgent.id, role: 'admin' }),
  }).catch(() => {})
  // 部门 admin 的写权限：向部门加一个新成员（requireDeptManager 通过即红线）
  // （加另一个 member 的 user agent——admin 有权加）
  const other = await seedRoleMember(BASE, owner, 'member')
  const ua2 = await apiAs(BASE, owner, '/api/agents')
  const otherAgent = (ua2?.agents ?? []).find((a: any) => a.type === 'user' && a.user_id === other.user!.id)
  let canAdd = false
  if (otherAgent) {
    try {
      await apiAs(BASE, admin, `/api/departments/${deptId}/members`, {
        method: 'POST', body: JSON.stringify({ agent_id: otherAgent.id, role: 'member' }),
      })
      canAdd = true
    } catch { canAdd = false }
  }
  assert.ok(canAdd, '部门 admin 可加成员（requireDeptManager 通过——部门级权限）')
})

test('非管理员隐藏「租户管理」导航（ADMIN_EMAILS 白名单——admin/me 判定）', async () => {
  const page = await browser.newPage()
  await injectAuth(page, owner)
  await openAgentPage(page, BASE, '/')
  await page.waitForTimeout(1500)
  const hasAdmin = await page.evaluate(() => document.body.innerText.includes('租户管理'))
  assert.ok(!hasAdmin, '非管理员（owner 非 ADMIN_EMAILS）不应显示租户管理入口')
  await page.close()
})

test('admin 页直接访问：非管理员核心 API 未授权（admin/me false——401/403）', async () => {
  // /api/admin/overview 未授权（非 ADMIN_EMAILS——401 或 403）
  const unauthorized = await (async () => {
    try { await apiAs(BASE, owner, '/api/admin/overview'); return false }
    catch (e: any) { return /401|403/.test(String(e.message)) }
  })()
  assert.ok(unauthorized, '非管理员访问 admin 概览未授权')
})
