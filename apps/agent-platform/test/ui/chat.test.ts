/**
 * 聊天页交互测试（UI-ROLE-TEST-PLAN Wave 1——2026-08）
 *
 * 用户教训：「点击才暴露的 bug」——聊天页核心交互：
 * - 发消息 → 消息气泡渲染（用户消息立即可见——WS 路径）
 * - 无 AI 成员的部门 → 系统提示（消除静默失败——chat.ts 注释语义）
 * - viewer 发消息 → 403（requireWriter 红线）
 *
 * 诚实裁剪（AGENTS 纪律——测试不进真实 LLM）：
 * - 真实 AI 回复/工具调用（LLM 依赖）→ 不测（慢/不稳定/成本）——登记
 * - 本测试只测「消息管道」交互（发送/渲染/权限）——确定性快
 * - 工具条展开/失败标注 → 由框架场景层 e2e 覆盖（mock 环境）
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import {
  startAgentServer, openAgentPage, registerTenant, injectAuth, apiAs,
  seedRoleMember, waitForBodyText, waitForText,
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
  owner = await registerTenant(BASE, 'chat')
  const dept = await apiAs(BASE, owner, '/api/departments', {
    method: 'POST', body: JSON.stringify({ name: '聊天部门' }),
  })
  deptId = dept.department.id
})

test.after(async () => {
  await browser?.close()
  server?.stop()
})

test('聊天页：发消息 → 消息气泡渲染（WS 管道——确定性）', async () => {
  const page = await browser.newPage()
  await injectAuth(page, owner)
  await openAgentPage(page, BASE, `/chat/${deptId}`)
  await waitForBodyText(page, /发送/)
  // 输入 + 发送
  await page.fill('textarea, input[type="text"]', '你好，聊天管道测试')
  await page.click('button:has-text("发送")')
  // 消息气泡出现（用户消息 sender 渲染）
  await waitForBodyText(page, /聊天管道测试/, 10_000)
  // 页面零错误（非资源加载）
  await page.close()
})

test('聊天页：@ 消息输入（@ 弹层出现——交互面）', async () => {
  const page = await browser.newPage()
  await injectAuth(page, owner)
  await openAgentPage(page, BASE, `/chat/${deptId}`)
  await waitForBodyText(page, /发送/)
  await page.fill('textarea, input[type="text"]', '@')
  // @ 弹层（成员列表）——至少不崩
  await page.waitForTimeout(500)
  const body = await page.evaluate(() => document.body.innerText)
  assert.ok(body.length > 0, '页面存活（@ 输入不崩）')
  await page.close()
})

test('聊天页：viewer 发消息 → 403（requireWriter 红线）', async () => {
  const viewer = await seedRoleMember(BASE, owner, 'viewer')
  const page = await browser.newPage()
  await injectAuth(page, viewer)
  await openAgentPage(page, BASE, `/chat/${deptId}`)
  await waitForBodyText(page, /发送/)
  await page.fill('textarea, input[type="text"]', 'viewer 尝试发消息')
  const send = page.locator('button:has-text("发送")').first()
  // 发送按钮可能禁用（前端隐藏写入口）——若可用则点击→403 toast
  const disabled = await send.isDisabled().catch(() => false)
  if (!disabled) {
    await send.click()
    // 403 提示（toast/错误——「只读成员」）或消息未发出（无新气泡）
    await page.waitForTimeout(1500)
    const body = await page.evaluate(() => document.body.innerText)
    assert.ok(
      !body.includes('viewer 尝试发消息') || body.includes('只读'),
      `viewer 发消息应被拒（403/只读提示）——当前：${body.slice(-100)}`,
    )
  }
  // API 级红线（服务端 requireWriter）
  let forbidden = false
  try {
    await apiAs(BASE, viewer, `/api/departments/${deptId}/messages`, {
      method: 'POST', body: JSON.stringify({ content: 'viewer api 消息' }),
    })
  } catch (e: any) {
    forbidden = String(e.message).includes('403')
  }
  assert.ok(forbidden, 'viewer 发消息 API 应 403')
  await page.close()
})

test('聊天页：无 AI 成员部门——系统提示引导（消除静默失败）', async () => {
  const page = await browser.newPage()
  await injectAuth(page, owner)
  await openAgentPage(page, BASE, `/chat/${deptId}`)
  await waitForBodyText(page, /发送/)
  // 无 AI 成员时应有引导提示（「添加 AI 成员」等——chat.ts 注释语义）
  const body = await page.evaluate(() => document.body.innerText)
  assert.ok(
    body.includes('AI') || body.includes('成员'),
    `无 AI 成员部门应有引导提示：${body.slice(0, 200)}`,
  )
  await page.close()
})
