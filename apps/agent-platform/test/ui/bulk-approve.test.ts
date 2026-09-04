/**
 * CHAT-INTERACTION 延伸：批量批准——积压部门 66 条待审实证（逐条 66 次点击）
 *
 * 契约锁定：
 * 1. 批量批准：同部门多条 → 全部 ai_approved=TRUE + 草稿发布（content=ai_draft）
 * 2. 权限：逐条校验部门 admin——跨部门批量部分成功（无权条目 failed 明细）
 * 3. 租户 owner 跨部门批量放行（与单条语义同源）
 * 4. 已审批/不存在条目 → failed 明细（幂等防御）
 * 5. 判负锁定：批量拒绝不提供（拒绝清 ai_draft 不可逆——误拒无挽回）
 * 6. 上限 50
 */
import { buildQuery } from 'weifuwu'
import {
  test } from 'node:test'
import assert from 'node:assert/strict'
import { startAgentServer,
  registerTenant,
  seedRoleMember,
  apiAs,
  type AgentServer,
  type TenantAuth,
  testDb,
} from './shared.ts'
import { chromium } from 'playwright'

let server: AgentServer
let BASE = ''
let owner: TenantAuth
let deptA = ''
let deptB = ''
let agentA = ''

// 共享池（每用例自建池 = 每次真实 PG 握手 + 池创建/销毁——55 次 seed 即 20s+——
// 上一版慢的根因；池复用后单条 INSERT <10ms）
let pg: any = null
async function getPg() {
  if (!pg) pg = testDb(BASE)
  return pg
}
async function closePg() {
  try { await pg?.close() } catch { /* 尽力 */ }
  pg = null
}

async function seedDraft(deptId: string, draft: string): Promise<string> {
  const conn = await getPg()
  const [row] = await conn.query(buildQuery().insert('messages').rows([{ department_id: deptId, sender_id: agentA, content: '[AI 生成中...]', msg_type: 'text', ai_draft: draft }]).returning('id').toQuery())
  return String(row.id)
}

/** 批量 seed（逐条——memory 不支持 generate_series/||——诚实循环） */
async function seedDrafts(deptId: string, n: number): Promise<string[]> {
  const conn = await getPg()
  const ids: string[] = []
  for (let i = 1; i <= n; i++) {
    const [row] = await conn.query(buildQuery().insert('messages').rows([{ department_id: deptId, sender_id: agentA, content: '上限草稿 ' + i, msg_type: 'text', ai_draft: '上限草稿 ' + i }]).returning('id').toQuery())
    ids.push(String(row?.id))
  }
  return ids
}

test.before(async () => {
  server = await startAgentServer()
  BASE = server.base
  owner = await registerTenant(BASE, 'bulk')
  const a = await fetch(`${BASE}/api/agents`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${owner.token}` },
    body: JSON.stringify({ type: 'ai', name: '批量AI', system_prompt: 'x' }),
  }).then((r) => r.json())
  agentA = a.agent.id
  const da = await fetch(`${BASE}/api/departments`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${owner.token}` },
    body: JSON.stringify({ name: '批量部A' }),
  }).then((r) => r.json())
  deptA = da.department.id
  const db = await fetch(`${BASE}/api/departments`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${owner.token}` },
    body: JSON.stringify({ name: '批量部B' }),
  }).then((r) => r.json())
  deptB = db.department.id
  // owner 加进部门 A（任命 manager——但审批要求部门 admin）
  // 直接用 seedDeptAdmin 形态：加成员 + 设 admin
  await fetch(`${BASE}/api/departments/${deptA}/members`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${owner.token}` },
    body: JSON.stringify({ agent_id: agentA, role: 'member' }),
  })
})

test.after(async () => {
  await closePg()
  server?.stop()
})

test('批量批准：同部门 3 条 → 全部发布（content=ai_draft + ai_approved=TRUE）', async () => {
  const ids = [await seedDraft(deptA, '批量草稿一'), await seedDraft(deptA, '批量草稿二'), await seedDraft(deptA, '批量草稿三')]
  // owner 先成为部门 A 管理员（走 seedDeptAdmin 同路径——user agent 入部门 + role=admin）
  const conn = await getPg()
  const [ua] = await conn.query(buildQuery().from('agents').select('id').where({ app_id: { eq: owner.app.id }, type: { eq: 'user' }, user_id: { eq: owner.user!.id } }).toQuery())
  await conn.query(buildQuery().insert('department_members').rows([{ department_id: deptA, agent_id: String(ua.id), role: 'admin' }]).onConflict(undefined, false).toQuery())
  const r = await apiAs(BASE, owner, '/api/messages/pending-approvals/bulk', {
    method: 'POST', body: JSON.stringify({ ids }),
  })
  assert.equal(r.approved, 3, `批量批准应全部成功（实际 ${JSON.stringify(r)}）`)
  assert.equal((r.failed ?? []).length, 0)
  // 权威断言：草稿已发布（逐 id——ANY 数组形态内存 parser 不支持——诚实逐查）
  const conn2 = await getPg()
  const rows: any[] = []
  for (const id of ids) {
    rows.push(...(await conn2.query(buildQuery().from('messages').select('content', 'ai_approved').where({ id: { eq: id } }).toQuery())))
  }
  for (const row of rows) {
    assert.equal(row.ai_approved, true, '应已批准')
    assert.ok(['批量草稿一', '批量草稿二', '批量草稿三'].includes(String(row.content)), `草稿应发布为正式消息（实际 ${row.content}）`)
  }
})

test('跨部门批量：member（非部门 admin）批量 → 全部 failed 无权限；owner 跨部门放行', async () => {
  const member = await seedRoleMember(BASE, owner, 'member')
  const idB = await seedDraft(deptB, 'B 部草稿')
  // member 无部门 admin → 403 明细
  const rMember = await apiAs(BASE, member, '/api/messages/pending-approvals/bulk', {
    method: 'POST', body: JSON.stringify({ ids: [idB] }),
  })
  assert.equal(rMember.approved, 0, 'member 批量批准应 0 成功')
  assert.ok((rMember.failed ?? [])[0]?.error.includes('部门管理员'), `失败明细应说明权限（实际 ${JSON.stringify(rMember.failed)}）`)
  // owner（租户级放行——审批页聚合全 app 待审的合理操作者）
  const rOwner = await apiAs(BASE, owner, '/api/messages/pending-approvals/bulk', {
    method: 'POST', body: JSON.stringify({ ids: [idB] }),
  })
  assert.equal(rOwner.approved, 1, 'owner 跨部门批量放行（租户级——与审批页聚合语义一致）')
})

test('幂等防御：已审批/不存在 id → failed 明细（不中断其余条目）', async () => {
  const fresh = await seedDraft(deptA, '幂等草稿')
  const fake = '00000000-0000-0000-0000-000000000009'
  const r = await apiAs(BASE, owner, '/api/messages/pending-approvals/bulk', {
    method: 'POST', body: JSON.stringify({ ids: [fresh, fake] }),
  })
  assert.equal(r.approved, 1, '有效条目应成功')
  assert.ok((r.failed ?? []).some((f) => f.id === fake), '不存在 id 应入 failed 明细')
  // 再批已审批的 → failed
  const r2 = await apiAs(BASE, owner, '/api/messages/pending-approvals/bulk', {
    method: 'POST', body: JSON.stringify({ ids: [fresh] }),
  })
  assert.equal(r2.approved, 0, '已审批条目不可重复批准')
  assert.ok((r2.failed ?? []).length === 1, '已审批入 failed 明细')
})

test('上限与判负锁定：ids > 50 截断生效；批量拒绝端点不存在（判负——不可逆）', async () => {
  const all = await seedDrafts(deptA, 52)
  const r = await apiAs(BASE, owner, '/api/messages/pending-approvals/bulk', {
    method: 'POST', body: JSON.stringify({ ids: all }),
  })
  assert.ok(r.approved <= 50, `上限 50（实际 ${r.approved}）`)
  // 批量拒绝端点不存在（404——判负留痕：拒绝留逐条慎重）
  const res = await fetch(`${BASE}/api/messages/pending-approvals/bulk-reject`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${owner.token}` },
    body: JSON.stringify({ ids: all.slice(0, 2) }),
  })
  assert.ok(res.status === 404 || res.status === 405, `批量拒绝端点应不存在（实际 ${res.status}）`)
})
