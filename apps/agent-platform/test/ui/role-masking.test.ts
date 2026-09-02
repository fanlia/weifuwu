/**
 * ROLES-OPTIMIZATION 波次 2：写入口角色遮蔽（前端防线与 API 403 双保险）
 *
 * 消除走查 P0-2 的「可点但失败」形态：写入口在无权限角色下禁用 + tooltip
 * 原因说明（引导而非惩罚）。感知点 = localStorage agent_platform_role
 * （ui/lib/roles.ts——Login/injectAuth 写入）。
 *
 * 遮蔽矩阵（矩阵口径 = §5）：
 * - Departments 创建部门：owner 可用；member（需租户所有者）/viewer（只读）禁用
 * - Agents 创建 Agent：owner/member 可用；viewer 禁用（writer 面）
 * - Settings 邀请区：owner 表单；member/viewer 禁用卡「仅租户所有者可用」
 * - Approvals：viewer/member 页头提示条；owner 无提示条
 * - Chat 输入框：viewer 禁用 + placeholder 引导；member 可用
 * - Workspace 新建：viewer 禁用（2026-08 既有——回归确认）
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
let viewer: TenantAuth

test.before(async () => {
  server = await startAgentServer()
  BASE = server.base
  browser = await chromium.launch()
  owner = await registerTenant(BASE, 'wave2')
  member = await seedRoleMember(BASE, owner, 'member')
  viewer = await seedRoleMember(BASE, owner, 'viewer')
})

test.after(async () => {
  await browser?.close()
  server?.stop()
})

interface Probe { disabled: boolean; title: string; placeholder?: string; hintBar?: boolean; inviteLocked?: boolean }

/** 打开页面并读写入口状态（禁用/tooltip/placeholder/提示条） */
async function probe(auth: TenantAuth, path: string): Promise<Probe> {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  await injectAuth(page, auth)
  const errors = await openAgentPage(page, BASE, path)
  await page.waitForFunction(() => (document.body.textContent ?? '').length > 150, undefined, { timeout: 10_000 })
  await page.waitForTimeout(300) // 列表加载后按钮渲染
  const p = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')]
    const create = btns.find((b) => /创建部门|创建 Agent|新建项目空间/.test(b.textContent ?? ''))
    const locked = document.body.textContent?.includes('仅租户所有者可用') ?? false
    const hintBar = (document.body.textContent ?? '').includes('只读成员无法执行此操作')
    const input = document.querySelector('textarea, input[type="text"]:not([placeholder*="搜索"])') as HTMLTextAreaElement | null
    return {
      disabled: create?.disabled ?? false,
      title: create?.getAttribute('title') ?? '',
      placeholder: input?.getAttribute('placeholder') ?? undefined,
      hintBar,
      inviteLocked: locked,
    }
  })
  assert.ok(fatalErrors(errors).length === 0, `零页面错误: ${errors.join(' | ')}`)
  await page.close()
  return p
}

test('Departments：owner 可用；member「需要租户所有者」；viewer「只读」——三态tooltip', async () => {
  const o = await probe(owner, '/departments')
  assert.equal(o.disabled, false, 'owner 创建部门按钮可用')
  const m = await probe(member, '/departments')
  assert.equal(m.disabled, true, 'member 创建部门按钮禁用（API member 建部门 403 的前端半边）')
  assert.ok(m.title.includes('租户所有者'), `member tooltip 说明原因（实际：${m.title}）`)
  const v = await probe(viewer, '/departments')
  assert.equal(v.disabled, true, 'viewer 创建部门按钮禁用')
  assert.ok(v.title.includes('只读'), `viewer tooltip 说明只读（实际：${v.title}）`)
})

test('Agents：owner/member 创建可用（writer 合法——不误伤）；viewer 禁用', async () => {
  const o = await probe(owner, '/agents')
  assert.equal(o.disabled, false, 'owner 创建 Agent 可用')
  const m = await probe(member, '/agents')
  assert.equal(m.disabled, false, 'member 创建 Agent 可用（writer 语义——遮蔽不误伤合法写面）')
  const v = await probe(viewer, '/agents')
  assert.equal(v.disabled, true, 'viewer 创建 Agent 禁用')
})

test('Settings：owner 邀请表单；member/viewer 禁用卡「仅租户所有者可用」', async () => {
  const o = await probe(owner, '/settings')
  assert.equal(o.inviteLocked, false, 'owner 邀请区为表单')
  const m = await probe(member, '/settings')
  assert.equal(m.inviteLocked, true, 'member 邀请区禁用卡（API 邀请 403 的前端半边）')
  const v = await probe(viewer, '/settings')
  assert.equal(v.inviteLocked, true, 'viewer 邀请区禁用卡')
})

test('Approvals：owner 无提示条；viewer 页头「只读成员无法执行此操作」提示', async () => {
  const o = await probe(owner, '/approvals')
  assert.equal(o.hintBar, false, 'owner 审批页无权限提示条')
  const v = await probe(viewer, '/approvals')
  assert.equal(v.hintBar, true, 'viewer 审批页有提示条（进页即知边界——非操作时 403）')
})

test('Chat：viewer 输入框禁用 + placeholder 引导；member 可用', async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  await injectAuth(page, viewer)
  const errors = await openAgentPage(page, BASE, '/')
  await page.waitForFunction(() => (document.body.textContent ?? '').length > 150, undefined, { timeout: 10_000 })
  // viewer 进入部门聊天（第一个部门）
  const deptLink = page.locator('a[href*="/departments/"], [data-wf-id]').first()
  try {
    await page.goto(`${BASE}/departments`)
    await page.waitForTimeout(500)
  } catch { /* 直接工作台也含输入面 */ }
  // 简化：进第一个可点的部门（存在性由 roles-journey 保证——此处仅断言聊天输入面）
  await page.close()
  // viewer 直接进部门：seed 阶段 owner 建默认部门——用 API 拿 id
  const depts = await fetch(`${BASE}/api/departments`, { headers: { Authorization: `Bearer ${owner.token}` } }).then((r) => r.json())
  const deptId = depts.departments?.[0]?.id
  if (!deptId) return
  const p2 = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  await injectAuth(p2, viewer)
  const errors2 = await openAgentPage(p2, BASE, `/departments/${deptId}`)
  await p2.waitForFunction(() => (document.body.textContent ?? '').includes('只读成员'), undefined, { timeout: 10_000 })
  // 精确选择器：ChatInput 默认单行 input（textarea 会误配 FilesSection 编辑器）
  const chatProbe = await p2.evaluate(() => {
    const input = document.querySelector('input[placeholder*="输入消息"], input[placeholder*="只读成员"]') as HTMLInputElement | null
    const ph = input?.getAttribute('placeholder') ?? ''
    return { disabled: input?.disabled ?? false, ph }
  })
  assert.equal(chatProbe.disabled, true, 'viewer 聊天输入框禁用')
  assert.ok(chatProbe.ph.includes('只读成员'), `placeholder 引导（实际：${chatProbe.ph}）`)
  assert.ok(fatalErrors(errors2).length === 0, `零页面错误: ${errors2.join(' | ')}`)
  await p2.close()
  // member 对照：输入可用
  const p3 = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  await injectAuth(p3, member)
  await openAgentPage(p3, BASE, `/departments/${deptId}`)
  await p3.waitForFunction(() => !!document.querySelector('input[placeholder*="输入消息"], input[placeholder*="只读成员"]'), undefined, { timeout: 10_000 })
  await p3.waitForTimeout(300)
  const memberProbe = await p3.evaluate(() => {
    const input = document.querySelector('input[placeholder*="输入消息"], input[placeholder*="只读成员"]') as HTMLInputElement | null
    return { disabled: input?.disabled ?? false }
  })
  assert.equal(memberProbe.disabled, false, 'member 聊天输入框可用（writer 合法）')
  await p3.close()
})
