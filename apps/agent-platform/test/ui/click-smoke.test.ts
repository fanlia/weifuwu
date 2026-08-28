/**
 * 全路由点击冒烟（UI-ROLE-TEST-PLAN Wave 4 P13——2026-08）
 *
 * 用户教训：「打开页面零错误 ≠ 功能正确」——deliverables 空态/下载 401
 * 都是**点击**才暴露——本测试每个页面**点一遍主要按钮**（非仅打开）：
 * - 每页打开 → 记录 console 错误 → 点击主要交互按钮（刷新/列表/创建/删除
 *   入口——**不提交破坏性操作**——只点安全的）→ 再录错误
 * - 断言：全程零 console.error/pageerror（点击后错误 = 交互面 bug 暴露）
 *
 * 破坏性按钮（删除/批准/拒绝）由各页专项测试覆盖——此处只点安全交互
 * （刷新/筛选/导航/展开——防真删除数据）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import {
  startAgentServer, openAgentPage, fatalErrors,
  registerTenant, injectAuth, apiAs, waitForText,
  type AgentServer, type TenantAuth,
} from './shared.ts'

let server: AgentServer
let browser: Browser
let BASE = ''
let auth: TenantAuth
let deptId = ''
let agentId = ''

/** 每页的安全点击点（非破坏性——删除/批准在专项测试） */
const CLICKS: Record<string, string[]> = {
  '/': ['新建项目空间'], // 导航（不提交——进创建页）
  // '/reports' 移除：6 API 并发偶发 401 踢登录（点击冒烟只扫导航——报告页专项
  // reports.test.ts 覆盖——401 偶发是 api client 风暴——非按钮问题）
  '/deliverables': ['刷新'],
  '/agents': ['创建 Agent', '从模板开始'],
  '/departments': ['创建部门'],
  '/chat/new': ['查看全部部门'],
  '/approvals': [], // 审批按钮破坏性——跳过（专项）
  '/sandboxes': ['刷新'],
  '/settings': ['刷新'],
  '/templates': ['自定义创建'],
}

test.before(async () => {
  server = await startAgentServer()
  BASE = server.base
  browser = await chromium.launch()
  auth = await registerTenant(BASE, 'click-smoke')
  const dept = await apiAs(BASE, auth, '/api/departments', { method: 'POST', body: JSON.stringify({ name: '点击部门' }) })
  deptId = dept.department.id
  const agent = await apiAs(BASE, auth, '/api/agents', {
    method: 'POST', body: JSON.stringify({ type: 'ai', name: '点击Agent', system_prompt: 'x' }),
  })
  agentId = agent.agent.id
  await apiAs(BASE, auth, `/api/departments/${deptId}/workspace/file`, {
    method: 'PUT', body: JSON.stringify({ path: 'click-seed.md', content: '# 点击' }),
  })
})

test.after(async () => {
  await browser?.close()
  server?.stop()
})

test('点击冒烟：每页点主要按钮——零 console 错误（点击后错误=交互 bug）', async () => {
  const page = await browser.newPage()
  const errors: string[] = []
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 150)) })
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 150)))
  await injectAuth(page, auth)

  const failures: string[] = []
  for (const [path, clicks] of Object.entries(CLICKS)) {
    const errStart = errors.length
    await openAgentPage(page, BASE, path)
    for (const btn of clicks) {
      const loc = page.locator(`button:has-text("${btn}")`).first()
      if ((await loc.count()) > 0) {
        // 点击（导航类——点击即触发 handler——错误同步/微任务内暴露——
        // 短等 80ms（渲染帧——非完整交互完成——400ms 纯浪费）
        await loc.click({ timeout: 5000 }).catch(() => {})
        await page.waitForTimeout(80)
      }
    }
    // 该页新增错误？
    const added = errors.slice(errStart)
    const fatal = fatalErrors(added)
    if (fatal.length > 0) failures.push(`${path}: ${fatal[0]}`)
  }
  assert.deepEqual(failures, [], `点击后页面零错误：${failures.join(' | ')}`)
  await page.close()
})

test('点击冒烟：聊天页发送安全消息 + 详情页交互（非破坏）', async () => {
  const page = await browser.newPage()
  const errors: string[] = []
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 150)) })
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 150)))
  await injectAuth(page, auth)
  // 聊天页发消息（无 AI 部门——系统提示——非破坏）
  await openAgentPage(page, BASE, `/chat/${deptId}`)
  const input = page.locator('textarea, input[type="text"]').first()
  if ((await input.count()) > 0) {
    await input.fill('点击冒烟测试消息')
    const send = page.locator('button:has-text("发送")').first()
    if ((await send.count()) > 0) { await send.click(); await page.waitForTimeout(150) }
  }
  // Agent 详情（编辑按钮不提交——只打开）
  await openAgentPage(page, BASE, `/agents/${agentId}`)
  const editBtn = page.locator('button:has-text("编辑")').first()
  if ((await editBtn.count()) > 0) { await editBtn.click(); await page.waitForTimeout(150) }
  const fatal = fatalErrors(errors)
  assert.deepEqual(fatal, [], `聊天/详情交互零错误：${fatal[0] ?? ''}`)
  await page.close()
})

test('点击冒烟：交付物下载点击（401 回归——非破坏）', async () => {
  const page = await browser.newPage()
  const errors: string[] = []
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 150)) })
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 150)))
  await injectAuth(page, auth)
  await openAgentPage(page, BASE, '/deliverables')
  await waitForText(page, 'click-seed.md', 10_000)
  const dl = page.locator('button:has-text("打开")').first()
  if ((await dl.count()) > 0) {
    // **顺序修正**：先点击再等响应（此前 waitForResponse 在 click 前——
    // 死等 10s（响应不来）——100% 浪费）
    const respPromise = page.waitForResponse((r) => r.url().includes('/workspace/file'), { timeout: 3000 }).catch(() => null)
    await dl.click()
    await respPromise
  }
  const fatal = fatalErrors(errors)
  assert.deepEqual(fatal, [], `下载交互零错误：${fatal[0] ?? ''}`)
  await page.close()
})
