/**
 * CHAT-INTERACTION 走查 P1 落地：部门页双入口 + 人类成员可加入部门
 *
 * 走查实证缺口：部门「添加成员」picker 显式排除人类成员（type !== 'user'）
 * ——owner 从 UI 无法把已加入应用的同事加进部门（只能加 AI）——同事进部门
 * 的唯一途径是 API 直调。本修复：
 * 1. picker 分组（AI 成员 / 同事）——不再排除 user agent
 * 2. 部门详情头部「邀请同事」次级入口（跳设置——仅 owner，角色遮蔽一致）
 * 3. 添加人类成员 = user agent 入 department_members（服务端零改动——
 *    POST members 本就收 agent_id，user agent 也是 agent）
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import {
  startAgentServer, openAgentPage, registerTenant, seedRoleMember, injectAuth, fatalErrors,
  type AgentServer, type TenantAuth,
} from './shared.ts'

let server: AgentServer
let browser: Browser
let BASE = ''
let owner: TenantAuth
let member: TenantAuth
let deptId = ''

test.before(async () => {
  server = await startAgentServer()
  BASE = server.base
  browser = await chromium.launch()
  owner = await registerTenant(BASE, 'dmember')
  member = await seedRoleMember(BASE, owner, 'member')
  const d = await fetch(`${BASE}/api/departments`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${owner.token}` },
    body: JSON.stringify({ name: '双入口部门' }),
  }).then((r) => r.json())
  deptId = d.department.id
  // 建 1 个 AI agent（AI 组非空）
  await fetch(`${BASE}/api/agents`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${owner.token}` },
    body: JSON.stringify({ type: 'ai', name: '双入口AI', system_prompt: 'x' }),
  })
})

test.after(async () => {
  await browser?.close()
  server?.stop()
})

async function openPicker(page: import('playwright').Page): Promise<void> {
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => (b.textContent ?? '').includes('添加成员'))
    btn?.click()
  })
  await page.waitForFunction(() => (document.body.textContent ?? '').includes('选择要添加的成员'), undefined, { timeout: 8000 })
  await page.waitForTimeout(400) // agent 列表异步加载
}

test('picker 分组：AI 成员 + 同事（人类成员不再被排除）', async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  await injectAuth(page, owner)
  const errors = await openAgentPage(page, BASE, `/departments/${deptId}`)
  await openPicker(page)
  const memberName = member.user?.name ?? ''
  const groups = await page.evaluate((mn) => {
    const t = document.body.textContent ?? ''
    return {
      aiGroup: t.includes('AI 成员'),
      userGroup: t.includes('同事（已加入应用）'),
      memberName: t.includes(mn), // seed 成员（user agent 名 = 用户名）
      aiName: t.includes('双入口AI'),
    }
  }, memberName)
  assert.ok(groups.aiGroup && groups.userGroup, `分组标题应渲染（实际：${JSON.stringify(groups)}）`)
  assert.ok(groups.memberName, '已加入应用的同事应出现在 picker（原被排除——缺口修复）')
  assert.ok(groups.aiName, 'AI 成员仍列出')
  assert.ok(fatalErrors(errors).length === 0, `零页面错误: ${errors.join(' | ')}`)
  await page.close()
})

test('添加同事进部门：勾选人类成员 → 部门成员 +1（API 权威断言）', async () => {
  const before = await fetch(`${BASE}/api/departments/${deptId}/workspace`, {
    headers: { Authorization: `Bearer ${owner.token}` },
  }).then((r) => r.json())
  const beforeCount = (before.members ?? []).length
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  await injectAuth(page, owner)
  await openAgentPage(page, BASE, `/departments/${deptId}`)
  await openPicker(page)
  // 勾选同事（user agent——按名字找 label）
  const memberName = member.user?.name ?? ''
  await page.evaluate((name) => {
    const labels = [...document.querySelectorAll('label')]
    const target = labels.find((l) => (l.textContent ?? '').includes(name))
    const cb = target?.querySelector('input[type="checkbox"]') as HTMLInputElement | null
    cb?.click()
  }, memberName)
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => /^添加 \d+ 个成员$/.test((b.textContent ?? '').trim()))
    btn?.click()
  })
  await page.waitForFunction(() => (document.body.textContent ?? '').includes('已添加成员'), undefined, { timeout: 8000 })
  const after = await fetch(`${BASE}/api/departments/${deptId}/workspace`, {
    headers: { Authorization: `Bearer ${owner.token}` },
  }).then((r) => r.json())
  assert.equal((after.members ?? []).length, beforeCount + 1, `部门成员应 +1（实际 ${beforeCount} → ${(after.members ?? []).length}）`)
  assert.ok((after.members ?? []).some((m: { type?: string }) => m.type === 'user'), '新成员应为人类成员（type=user）')
  await page.close()
})

test('双入口遮蔽：owner 见「邀请同事」；member 不见（与 Settings 邀请遮蔽一致）', async () => {
  const po = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  await injectAuth(po, owner)
  await openAgentPage(po, BASE, `/departments/${deptId}`)
  await po.waitForFunction(() => (document.body.textContent ?? '').includes('进入聊天'), undefined, { timeout: 8000 })
  const ownerSee = await po.evaluate(() => [...document.querySelectorAll('button')].some((b) => (b.textContent ?? '').includes('邀请同事')))
  assert.ok(ownerSee, 'owner 部门详情应见「邀请同事」入口')
  await po.close()

  const pm = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  await injectAuth(pm, member)
  await openAgentPage(pm, BASE, `/departments/${deptId}`)
  await pm.waitForFunction(() => (document.body.textContent ?? '').includes('进入聊天'), undefined, { timeout: 8000 })
  const memberSee = await pm.evaluate(() => [...document.querySelectorAll('button')].some((b) => (b.textContent ?? '').includes('邀请同事')))
  assert.equal(memberSee, false, 'member 不应见「邀请同事」（邀请 Owner only——前端遮蔽与 API 一致）')
  await pm.close()
})
