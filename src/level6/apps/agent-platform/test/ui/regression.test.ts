/**
 * 历史 bug 回归清单（UI-ROLE-TEST-PLAN Wave 4 P14——2026-08）
 *
 * 用户教训：「点击才暴露的 bug」——本文件把**已修复的用户实证缺陷**逐一
 * 固化为回归断言（每个 bug 一条——防回潮）：
 * - R1 /deliverables 空态（factory 捕获旧引用 + mounting 违例）
 * - R2 工作区下载 401（<a href> 无 Bearer）
 * - R3 join 响应角色硬编码 member
 * - R4 viewer 前端新建按钮未禁用
 * - R5 删除成功却报「删除失败」（res.ok 响应判断错）
 * - R6 member 能建部门（权限过宽）
 * - R7 viewer 能删部门（无鉴权）
 * - R8 admin 概览 500 而非 403
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import {
  startAgentServer, openAgentPage, registerTenant, injectAuth, apiAs,
  seedRoleMember, waitForText,
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
  owner = await registerTenant(BASE, 'regress')
  const dept = await apiAs(BASE, owner, '/api/departments', { method: 'POST', body: JSON.stringify({ name: '回归部门' }) })
  deptId = dept.department.id
  await apiAs(BASE, owner, `/api/departments/${deptId}/workspace/file`, {
    method: 'PUT', body: JSON.stringify({ path: 'regress-seed.md', content: '# 回归' }),
  })
})

test.after(async () => {
  await browser?.close()
  server?.stop()
})

// R1 + R2：deliverables 空态与下载 401（用户实证核心缺陷）
test('R1/R2 回归：交付物渲染 + 下载 200（历史缺陷回潮防线）', async () => {
  const page = await browser.newPage()
  await injectAuth(page, owner)
  await openAgentPage(page, BASE, '/deliverables')
  await waitForText(page, 'regress-seed.md', 15_000) // R1：空态回归（曾永远空态）
  const body = await page.evaluate(() => document.body.innerText)
  assert.ok(!body.includes('还没有交付物'), 'R1：不得空态')
  // R2：下载 200（曾 <a href> 401——v2 直链方案：token query 鉴权）
  const dl = page.locator('button:has-text("打开")').first()
  if ((await dl.count()) > 0) {
    const qs = await page.evaluate((p) => {
      const t = localStorage.getItem('agent_platform_token')
      return fetch(`/api/departments/${p}/workspace/file?path=${encodeURIComponent('regress-seed.md')}&download=1&token=${encodeURIComponent(t)}`)
        .then((r) => r.status)
    }, deptId)
    assert.equal(qs, 200, 'R2：token 直链 200（曾 401——框架 mw query token 鉴权）')
  }
  await page.close()
})

// R3：join 响应角色（曾硬编码 member）
test('R3 回归：invite role=viewer → join 响应 viewer（曾硬编码 member）', async () => {
  const viewer = await seedRoleMember(BASE, owner, 'viewer')
  assert.equal(viewer.app.role, 'viewer', 'R3：join 响应角色正确')
})

// R4：viewer 前端新建按钮禁用（曾可点——点击才 403）
test('R4 回归：viewer 新建项目空间按钮禁用（前端防线）', async () => {
  const viewer = await seedRoleMember(BASE, owner, 'viewer')
  const page = await browser.newPage()
  await injectAuth(page, viewer)
  await openAgentPage(page, BASE, '/')
  await page.waitForTimeout(1500)
  const btn = page.locator('button:has-text("新建项目空间")').first()
  if ((await btn.count()) > 0) {
    const disabled = await btn.isDisabled()
    assert.ok(disabled, 'R4：viewer 新建按钮禁用（曾可点）')
  }
  await page.close()
})

// R5：删除成功不报失败（曾 res.ok 永远 undefined → 失败 toast）
test('R5 回归：删除 Agent 后列表刷新（曾成功却报「删除失败」）', async () => {
  const agent = await apiAs(BASE, owner, '/api/agents', {
    method: 'POST', body: JSON.stringify({ type: 'ai', name: '回归删除目标', system_prompt: 'x' }),
  })
  const page = await browser.newPage()
  await injectAuth(page, owner)
  await openAgentPage(page, BASE, '/agents')
  await waitForText(page, '回归删除目标', 10_000)
  await page.locator('button:has-text("删除")').first().click()
  const ok = page.locator('button:has-text("确定")').first()
  if ((await ok.count()) > 0) await ok.click()
  await page.waitForFunction(
    () => !(document.body.textContent ?? '').includes('回归删除目标'),
    '删除后消失',
    { timeout: 10_000 },
  )
  assert.ok(true, 'R5：删除生效（曾数据删了 UI 报失败）')
  await page.close()
})

// R6/R7：权限矩阵（member 建部门 403 / viewer 删部门 403）
test('R6/R7 回归：权限矩阵——member 建部 403 + viewer 删部 403', async () => {
  const member = await seedRoleMember(BASE, owner, 'member')
  let m6 = false
  try { await apiAs(BASE, member, '/api/departments', { method: 'POST', body: JSON.stringify({ name: 'rm-dept' }) }) }
  catch (e: any) { m6 = /403/.test(String(e.message)) }
  assert.ok(m6, 'R6：member 建部门 403（曾放行）')

  const viewer = await seedRoleMember(BASE, owner, 'viewer')
  let v7 = false
  try { await apiAs(BASE, viewer, `/api/departments/${deptId}`, { method: 'DELETE' }) }
  catch (e: any) { v7 = /403/.test(String(e.message)) }
  assert.ok(v7, 'R7：viewer 删部门 403（曾无鉴权）')
})

// R8：admin 概览权限标准化（曾 500）
test('R8 回归：非管理员 admin 概览 403（曾 500）', async () => {
  let unauthorized = false
  try { await apiAs(BASE, owner, '/api/admin/overview') }
  catch (e: any) { unauthorized = /403/.test(String(e.message)) }
  assert.ok(unauthorized, 'R8：admin 概览 403（曾 500——HttpError 修复）')
})
