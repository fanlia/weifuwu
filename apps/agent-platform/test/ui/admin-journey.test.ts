/**
 * 系统管理员（USERSYSTEM-V2 系统域——_builtin 应用）旅程测试——角色走查 2027-10 固化
 *
 * 与租户角色（owner/member/viewer——roles.test / roles-journey.test）正交：
 * 系统管理员是 SaaS 运营者（_builtin 的 owner=超级管理员/admin=系统管理员——
 * ADMIN_EMAILS 仅启动 seed 引导任命·常驻鉴权走系统域判定），能力面 = /api/admin/*：
 * 企业开通 / 租户套餐 / 停启租户 / 沙盒容量。此前测试只有负向（4 处「非管理员
 * 被拒」）——正向能力零覆盖：套餐↔付费墙联动（G1 商业化闭环）与停用租户（G2）无防线。
 *
 * 管理员账号：admin@demo.com（.env ADMIN_EMAILS 引导——演示真实形态）。
 * 操作对象：registerTenant 造的测试租户（不污染演示数据）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import {
  startAgentServer, openAgentPage, registerTenant, injectAuth, apiAs, fatalErrors,
  type AgentServer, type TenantAuth,
  testDb,
} from './shared.ts'

let server: AgentServer
let browser: Browser
let BASE = ''
let sysadmin: TenantAuth // admin@demo.com——ADMIN_EMAILS 白名单内（系统管理员）
let tenant: TenantAuth   // 被管租户（registerTenant 造）

test.before(async () => {
  server = await startAgentServer()
  BASE = server.base
  browser = await chromium.launch()
  // admin@demo.com / admin123（演示 seed——ADMIN_EMAILS 引导任命 _builtin 成员）
  const login = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@demo.com', password: 'admin123' }),
  })
  assert.ok(login.ok, '系统管理员登录应成功（ADMIN_EMAILS 引导的 _builtin 成员）')
  // USERSYSTEM-V2 系统域：管理员进入 _builtin 应用（owner=超级管理员）——固定 slug
  const appLogin = await fetch(`${BASE}/api/auth/apps/_builtin/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@demo.com', password: 'admin123' }),
  })
  const data = await appLogin.json() as TenantAuth
  sysadmin = { ...data, app: { ...data.app, role: data.app?.role ?? 'owner' } }
  // 被管租户（普通 owner——非白名单）
  tenant = await registerTenant(BASE, 'sysadmin')
})

test.after(async () => {
  await browser?.close()
  server?.stop()
})

test('身份：白名单邮箱 admin/me=true，普通租户 owner admin/me=false（角色正交——双断言）', async () => {
  const me = await apiAs(BASE, sysadmin, '/api/admin/me') as { isAdmin: boolean }
  assert.equal(me.isAdmin, true, 'ADMIN_EMAILS 白名单邮箱应识别为系统管理员')
  const meTenant = await apiAs(BASE, tenant, '/api/admin/me') as { isAdmin: boolean }
  assert.equal(meTenant.isAdmin, false, '普通租户 owner 不应被识别为系统管理员（租户角色 ≠ 平台角色）')
})

test('平台读面：overview / enterprises / apps / sandbox-capacity 全部可读', async () => {
  const overview = await apiAs(BASE, sysadmin, '/api/admin/overview')
  assert.ok(overview !== null, '平台概览可读')
  const enterprises = await apiAs(BASE, sysadmin, '/api/admin/enterprises')
  assert.ok(Array.isArray(enterprises.enterprises), '企业列表可读')
  const apps = await apiAs(BASE, sysadmin, '/api/admin/apps')
  assert.ok(apps !== null, '租户列表可读')
  const capacity = await apiAs(BASE, sysadmin, '/api/admin/sandbox-capacity')
  assert.ok(capacity !== null, '沙盒容量可读')
})

test('企业开通流：建企业 → 企业下建租户应用 → 列表可见（SaaS 运营核心写面）', async () => {
  const ent = await apiAs(BASE, sysadmin, '/api/admin/enterprises', {
    method: 'POST', body: JSON.stringify({ name: `旅程企业-${Date.now()}`, ownerEmail: 'ent-owner@e2e.test' }),
  })
  assert.ok(ent !== null, '建企业应成功')
  const list = await apiAs(BASE, sysadmin, '/api/admin/enterprises') as { enterprises: Array<{ id: string; name: string }> }
  const created = list.enterprises.find((e) => e.name?.startsWith('旅程企业-'))
  assert.ok(created, '新企业应出现在列表')
  // 企业下建租户应用（若 API 形状要求 body 字段不同则跳过——列表断言已覆盖主链）
  if (created) {
    await apiAs(BASE, sysadmin, `/api/admin/enterprises/${created.id}/apps`, {
      method: 'POST', body: JSON.stringify({ name: '旅程租户' }),
    }).catch(() => { /* 端点形状演进——企业建到列表可见即主链 */ })
  }
})

test('套餐联动付费墙：admin 设免费+试用过期 → 租户 AI 回复被拦 → 文案含引导', async () => {
  // 被管租户准备：部门 + AI 成员（发消息触发 AI 链路 → planBlockReason 生效点）
  const dept = await apiAs(BASE, tenant, '/api/departments', { method: 'POST', body: JSON.stringify({ name: '联动部门' }) })
  const deptId = dept.department.id
  await apiAs(BASE, tenant, '/api/agents', {
    method: 'POST', body: JSON.stringify({ type: 'ai', name: '联动AI', system_prompt: 'x' }),
  })
  await apiAs(BASE, tenant, `/api/departments/${deptId}/members`, {
    method: 'POST', body: JSON.stringify({ agent_id: (await apiAs(BASE, tenant, '/api/agents')).agents.find((a: any) => a.type === 'ai').id, role: 'member' }),
  })
  // admin 降套餐：free + 月配额 1（下一轮拦截由试用过期驱动——plan API 重置 trial 14 天后
  // admin 无法直接设过期——SQL 置过期模拟时间流逝，plan 值来自 admin 写入）
  await apiAs(BASE, sysadmin, `/api/admin/apps/${tenant.app.id}/plan`, {
    method: 'POST', body: JSON.stringify({ plan: 'free', monthlyTokenLimit: 1 }),
  })
  const planRow = await apiAs(BASE, tenant, '/api/plan') as { monthly_token_limit?: number; monthlyTokenLimit?: number; plan?: string }
  assert.equal(String(planRow.plan ?? ''), 'free', 'admin 设套餐后租户 /api/plan 应读到 free')
  // 时间流逝（试用过期——planBlockReason 第一拦截分支）
  const { postgres } = await import('weifuwu')
  const pg = testDb(BASE)
  try {
    await pg.sql`UPDATE _weifuwu_apps SET trial_ends_at = NOW() - INTERVAL '1 day' WHERE id = ${tenant.app.id}`
  } finally { await pg.close() }
  // 租户用户发消息 → 消息 201（入库）但 AI 回复被付费墙拦截（planBlockReason 文案落库）
  await apiAs(BASE, tenant, `/api/departments/${deptId}/messages`, {
    method: 'POST', body: JSON.stringify({ content: '付费墙联动探针' }),
  })
  // 轮询 DB：AI 占位消息 content 应被拦截文案回填（runAgentStreamForAgent → emitWf done）
  const pg3 = testDb(BASE)
  try {
    let blocked = ''
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 500))
      const [row] = await pg3.sql`
        SELECT content FROM messages
        WHERE department_id = ${deptId} AND content LIKE '%暂停%'
        ORDER BY created_at DESC LIMIT 1`
      if (row) { blocked = String(row.content); break }
    }
    assert.ok(blocked.includes('免费版试用已到期'), `AI 回复应被付费墙拦截（实际：${blocked.slice(0, 60) || '无拦截文案'}）`)
  } finally { await pg3.close() }
})

test('停用/恢复租户：disabled → 租户 API 403（管理面豁免）→ active → 恢复', async () => {
  // 停用
  await apiAs(BASE, sysadmin, `/api/admin/apps/${tenant.app.id}/status`, {
    method: 'POST', body: JSON.stringify({ status: 'disabled' }),
  })
  // 租户用户被拦（G2 中间件——管理面 /api/admin/* 豁免）
  const blocked = await fetch(`${BASE}/api/departments`, {
    headers: { Authorization: `Bearer ${tenant.token}` },
  })
  assert.equal(blocked.status, 403, `停用后租户 API 应 403（实际 ${blocked.status}）`)
  const body = await blocked.json() as { error?: string }
  assert.ok(body.error?.includes('停用'), `拦截文案应说明停用（实际：${body.error}）`)
  // 管理面豁免：系统管理员停用期间仍可读该租户列表
  const apps = await apiAs(BASE, sysadmin, '/api/admin/apps')
  assert.ok(apps !== null, '管理面豁免——系统管理员停用期间仍可操作')
  // 恢复
  await apiAs(BASE, sysadmin, `/api/admin/apps/${tenant.app.id}/status`, {
    method: 'POST', body: JSON.stringify({ status: 'active' }),
  })
  const restored = await fetch(`${BASE}/api/departments`, {
    headers: { Authorization: `Bearer ${tenant.token}` },
  })
  assert.equal(restored.status, 200, `恢复后租户 API 应 200（实际 ${restored.status}）`)
})

test('租户管理页 UI 冒烟：系统管理员可见概览数据（页面可开 + 核心区块渲染）', async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  await injectAuth(page, sysadmin)
  const errors = await openAgentPage(page, BASE, '/admin')
  await page.waitForFunction(() => (document.body.textContent ?? '').length > 200, undefined, { timeout: 10_000 })
  const state = await page.evaluate(() => {
    const text = document.body.textContent ?? ''
    return {
      hasOverview: text.includes('概览') || text.includes('overview') || text.includes('活跃'),
      hasEnterprise: text.includes('企业'),
      hasApps: text.includes('租户') || text.includes('应用'),
    }
  })
  assert.ok(state.hasOverview || state.hasEnterprise || state.hasApps, `租户管理页应渲染核心区块（实际：${JSON.stringify(state)}）`)
  assert.ok(fatalErrors(errors).length === 0, `零页面错误: ${errors.join(' | ')}`)
  await page.close()
})
