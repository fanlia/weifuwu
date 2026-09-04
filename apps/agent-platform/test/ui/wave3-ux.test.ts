/**
 * ROLES-OPTIMIZATION 波次 3：403 原因透出 + 按角色落地引导（走查 P0-1）
 *
 * 1. 403 透出：服务端错误 body 不再被吞——toast 展示具体原因
 *    （验证路径 = member 点审批（requireDeptManager 403）——viewer 发消息
 *    已在波次 2 前置禁用，不再产生运行时 403）
 * 2. 落地引导：工作台按角色定制首屏——
 *    viewer「你是只读成员」身份卡（原零引导空白）/ member「等待所有者创建
 *    项目空间」/ owner 三步引导不变（回归对照）
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import {
  startAgentServer, openAgentPage, registerTenant, seedRoleMember, injectAuth, fatalErrors,
  type AgentServer, type TenantAuth,
  testDb,
} from './shared.ts'

let server: AgentServer
let browser: Browser
let BASE = ''
let owner: TenantAuth
let member: TenantAuth
let viewer: TenantAuth
let deptId = ''

test.before(async () => {
  server = await startAgentServer()
  BASE = server.base
  browser = await chromium.launch()
  owner = await registerTenant(BASE, 'wave3')
  member = await seedRoleMember(BASE, owner, 'member')
  viewer = await seedRoleMember(BASE, owner, 'viewer')
  const d = await fetch(`${BASE}/api/departments`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${owner.token}` },
    body: JSON.stringify({ name: '波次3部门' }),
  }).then((r) => r.json())
  deptId = d.department.id
})

test.after(async () => {
  await browser?.close()
  server?.stop()
})

test('403 原因透出：member 点审批 → toast 含服务端原因（不再统一「操作失败」）', async () => {
  // 种子草稿（API 直接种——同 approvals.test 诚实裁剪路径）
  const agents = await fetch(`${BASE}/api/agents`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${owner.token}` },
    body: JSON.stringify({ type: 'ai', name: '波次3AI', system_prompt: 'x' }),
  }).then((r) => r.json())
  await fetch(`${BASE}/api/departments/${deptId}/members`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${owner.token}` },
    body: JSON.stringify({ agent_id: agents.agent.id, role: 'member' }),
  })
  const pg = testDb(BASE)
  try {
    // app_id 过滤：agents 表跨租户同名——不限定会命中其它测试租户的同名 agent
    const [aiAgent] = await pg.sql`
      SELECT id FROM agents WHERE name = '波次3AI' AND app_id = ${owner.app.id} LIMIT 1`
    await pg.sql`
      INSERT INTO messages (department_id, sender_id, content, msg_type, ai_draft, ai_approved)
      VALUES (${deptId}, ${aiAgent.id}, '[AI 生成中...]', 'text', '波次3透出验证草稿', NULL)
    `
  } finally { await pg.close() }

  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  await injectAuth(page, member)
  const errors = await openAgentPage(page, BASE, '/approvals')
  await page.waitForFunction(() => (document.body.textContent ?? '').includes('波次3透出验证草稿'), undefined, { timeout: 10_000 })
  // member 点批准 → requireDeptManager 403 → toast 透出原因（含「部门管理员」语义）
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => /^\s*批准\s*$/.test((b.textContent ?? '').trim())) // 精确（排除批量按钮）
    btn?.click()
  })
  await page.waitForFunction(() => {
    const toast = [...document.querySelectorAll('[class*=toast]')].map((t) => t.textContent ?? '').join(' ')
    return toast.includes('操作失败') && toast.length > '操作失败'.length + 2
  }, undefined, { timeout: 10_000 })
  const toastText = await page.evaluate(() => [...document.querySelectorAll('[class*=toast]')].map((t) => t.textContent ?? '').join(' | '))
  assert.ok(toastText.includes('部门管理员') || toastText.includes('管理员'), `toast 应透出 403 原因（实际：${toastText}）`)
  assert.ok(fatalErrors(errors).length === 0, `零页面错误: ${errors.join(' | ')}`)
  await page.close()
})

test('落地引导：viewer 工作台「你是只读成员」身份卡（原零引导）', async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  await injectAuth(page, viewer)
  const errors = await openAgentPage(page, BASE, '/')
  await page.waitForFunction(() => (document.body.textContent ?? '').includes('你是只读成员'), undefined, { timeout: 10_000 })
  const state = await page.evaluate(() => {
    const t = document.body.textContent ?? ''
    return {
      identity: t.includes('你是只读成员'),
      capability: t.includes('下载交付物'),
      guide: t.includes('浏览交付物'),
    }
  })
  assert.ok(state.identity && state.capability && state.guide, `viewer 身份卡应含身份+能力+出口（实际：${JSON.stringify(state)}）`)
  assert.ok(fatalErrors(errors).length === 0, `零页面错误: ${errors.join(' | ')}`)
  await page.close()
})

test('落地引导：member 无空间「等待所有者」+ 不渲染创建按钮；owner 三步引导不变', async () => {
  // 空态需要独立租户（主租户已有波次3部门——projects 非空不触发空态分支）
  const owner2 = await registerTenant(BASE, 'wave3-empty')
  const member2 = await seedRoleMember(BASE, owner2, 'member')
  const pm = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  await injectAuth(pm, member2)
  await openAgentPage(pm, BASE, '/')
  await pm.waitForFunction(() => (document.body.textContent ?? '').length > 150, undefined, { timeout: 10_000 })
  await pm.waitForTimeout(500)
  const m = await pm.evaluate(() => {
    const t = document.body.textContent ?? ''
    const btns = [...document.querySelectorAll('button')].map((b) => ({ text: b.textContent ?? '', disabled: b.disabled }))
    const create = btns.find((b) => b.text.includes('新建项目空间') || b.text.includes('创建项目空间'))
    return { wait: t.includes('等待所有者'), createBtn: create ?? null }
  })
  assert.ok(m.wait, 'member 空态应显示「等待所有者」引导')
  assert.ok(m.createBtn === null || m.createBtn.disabled, 'member 不应渲染可用的创建按钮')
  await pm.close()

  const po = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  await injectAuth(po, owner2)
  await openAgentPage(po, BASE, '/')
  await po.waitForFunction(() => (document.body.textContent ?? '').length > 150, undefined, { timeout: 10_000 })
  await po.waitForTimeout(500)
  const o = await po.evaluate(() => {
    const t = document.body.textContent ?? ''
    const btns = [...document.querySelectorAll('button')].map((b) => ({ text: b.textContent ?? '', disabled: b.disabled }))
    const create = btns.find((b) => b.text.includes('新建项目空间') || b.text.includes('创建项目空间'))
    return { threeStep: t.includes('三步开始'), createBtn: create ?? null }
  })
  assert.ok(o.threeStep, 'owner 空态保持三步引导（回归对照）')
  assert.ok(o.createBtn !== null && !o.createBtn.disabled, 'owner 创建按钮可用')
  await po.close()
})
