/**
 * 工作台页面交互测试（UI-ROLE-TEST-PLAN Wave 1——2026-08）
 *
 * 用户教训：冒烟（打开零错误）不覆盖链接/按钮点击——本测试固化：
 * - 项目空间卡片 → 点击进对应 chat
 * - 交付物卡片 → 点击进 /deliverables
 * - 新建项目空间按钮 → /departments/new
 * - viewer 视角：写操作入口被禁（新建按钮 403 或不可见）
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import {
  startAgentServer, openAgentPage, waitForText, registerTenant, injectAuth, apiAs,
  seedRoleMember, waitForBodyText,
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
  owner = await registerTenant(BASE, 'ws')
  const dept = await apiAs(BASE, owner, '/api/departments', {
    method: 'POST', body: JSON.stringify({ name: '工作台部门' }),
  })
  deptId = dept.department.id
})

test.after(async () => {
  await browser?.close()
  server?.stop()
})

test('工作台：项目卡片点击 → 进入对应 chat（导航链路交互）', async () => {
  const page = await browser.newPage()
  await injectAuth(page, owner)
  const errors = await openAgentPage(page, BASE, '/')
  // 卡片含部门名——点击卡片 → chat
  await waitForText(page, '工作台部门')
  await page.click('text=工作台部门')
  await waitForBodyText(page, /发送/)
  assert.ok(page.url().includes(`/chat/${deptId}`), `URL 应进 chat：${page.url()}`)
  assert.deepEqual(errors.filter((e) => !e.includes('Failed to load resource')), [], `零错误：${errors.join('; ')}`)
  await page.close()
})

test('工作台：交付物卡片 → /deliverables（若工作区有文件）', async () => {
  // 种子：写文件到部门工作区（交付物可见）
  await apiAs(BASE, owner, `/api/departments/${deptId}/workspace/file`, {
    method: 'PUT', body: JSON.stringify({ path: 'ws-seed.md', content: '# 工作台交付物' }),
  })
  const page = await browser.newPage()
  await injectAuth(page, owner)
  await openAgentPage(page, BASE, '/')
  await waitForText(page, 'ws-seed.md')
  // 点击交付物条目（入口可能在工作台交付物区——点文件名/卡片）
  const link = page.locator('text=ws-seed.md').first()
  assert.ok((await link.count()) > 0, '交付物条目可见')
  await link.click()
  await waitForBodyText(page, /交付物中心/)
  assert.ok(page.url().includes('/deliverables'), `URL 应进 deliverables：${page.url()}`)
  await page.close()
})

test('工作台：新建项目空间按钮 → /departments/new（owner——写入口）', async () => {
  const page = await browser.newPage()
  await injectAuth(page, owner)
  await openAgentPage(page, BASE, '/')
  await waitForText(page, '新建项目空间')
  await page.click('text=新建项目空间')
  await waitForBodyText(page, /创建部门|部门名称/)
  assert.ok(page.url().includes('/departments/new'), `URL 应进 departments/new：${page.url()}`)
  await page.close()
})

test('工作台：viewer 视角——新建按钮不可写（只读红线）', async () => {
  const viewer = await seedRoleMember(BASE, owner, 'viewer')
  const page = await browser.newPage()
  await injectAuth(page, viewer)
  await openAgentPage(page, BASE, '/')
  await waitForText(page, '项目空间')
  // 断言：viewer 不应看到可用写入口（按钮 disabled / 403 toast / 不可见）
  const newBtn = page.locator('button:has-text("新建项目空间")')
  const count = await newBtn.count()
  if (count > 0) {
    const disabled = await newBtn.first().isDisabled()
    assert.ok(disabled, 'viewer 的新建按钮应禁用（只读）')
  } else {
    // 不可见 = 也满足只读（写入口隐藏）
    assert.ok(true, 'viewer 写入口隐藏（只读红线保持）')
  }
  // 尝试 API 级写（发部门创建——应 403）——服务端红线
  let forbidden = false
  try {
    await apiAs(BASE, viewer, '/api/departments', {
      method: 'POST', body: JSON.stringify({ name: `viewer-${Date.now()}` }),
    })
  } catch (e: any) {
    forbidden = String(e.message).includes('403')
  }
  assert.ok(forbidden, 'viewer 建部门 API 应 403（服务端红线）')
  await page.close()
})
