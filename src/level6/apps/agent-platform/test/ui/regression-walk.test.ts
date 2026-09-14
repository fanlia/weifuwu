/**
 * 用户视角走查回归（2026-XX 走查实证修复固化——UI-ROLE-TEST-PLAN 增补波次）
 *
 * 本次走查（owner 主线 × 真实浏览器）修复清单：
 * - BUG-1：登录失败提示显示原始 i18n key（APP_MESSAGES 从未注册到 i18n 中间件）
 * - BUG-2：同域名第二个注册用户必失败（slug = 邮箱域名撞唯一键）且误报「邮箱已注册」
 * - BUG-3：AgentDetail tab「文件」「知识库」指向不存在的 sec-files/sec-knowledge 锚点（点击无反应）
 * - G13：api 中间件旋转安全（框架层——src/test/contract/api.test.ts 已锁定）
 * - G14：StatCard 数字动画 rAF 停摆恒显示 0（框架层——直落终值修复）
 * - stats API 静默空数据（appId 缺失 200 全 0 → 显式 401）
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import {
  startAgentServer, registerTenant, injectAuth, apiAs,
  type AgentServer, type TenantAuth,
} from './shared.ts'

let server: AgentServer
let browser: Browser
let BASE = ''

test.before(async () => {
  server = await startAgentServer()
  BASE = server.base
  browser = await chromium.launch()
})

test.after(async () => {
  await browser?.close()
  server?.stop()
})

test('BUG-2 回归：同域名两个用户注册都成功（slug 自动去重——不再误报邮箱已注册）', async () => {
  const domain = `walkbug-${Date.now()}.test`
  const r1 = await fetch(`${BASE}/api/auth/register-app`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: `alice-${Date.now()}@${domain}`, password: 'Test12345', name: '甲' }),
  })
  assert.ok([200, 201].includes(r1.status), `第一个同域名用户注册成功（实际 ${r1.status}）`)
  const r2 = await fetch(`${BASE}/api/auth/register-app`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: `bob-${Date.now()}@${domain}`, password: 'Test12345', name: '乙' }),
  })
  assert.ok([200, 201].includes(r2.status), `第二个同域名用户注册成功（slug 去重后）——旧代码 409 duplicate slug（实际 ${r2.status}）`)
})

test('BUG-2 回归：注册页不传 appSlug 时登录页错误映射不误报（slug 冲突 ≠ 邮箱已注册）', async () => {
  // authErrorKey 的 slug 冲突精确匹配（_weifuwu_apps_slug_key → err.app_slug_taken，
  // 不落入 /duplicate/ → email_exists 泛匹配）
  const { authErrorKey } = await import('../../ui/lib/i18n.ts')
  assert.equal(
    authErrorKey('数据库错误: duplicate key value violates unique constraint "_weifuwu_apps_slug_key"'),
    'err.app_slug_taken',
    'slug 冲突 → 团队标识错误（非邮箱已注册）',
  )
  assert.equal(
    authErrorKey('数据库错误: duplicate key value violates unique constraint "_weifuwu_users_email_key"'),
    'err.email_exists',
    'users email 冲突 → 邮箱已注册（保持）',
  )
})

test('BUG-3 回归：AgentDetail tab 锚点全部指向真实渲染的 section（无悬空锚点）', async () => {
  const auth: TenantAuth = await registerTenant(BASE, 'bug3')
  // 建 AI Agent
  const agent = await apiAs(BASE, auth, '/api/agents', {
    method: 'POST', body: JSON.stringify({ type: 'ai', name: '锚点AI', system_prompt: 'x' }),
  })
  const page = await browser.newPage()
  await injectAuth(page, auth)
  await page.goto(`${BASE}/agents/${agent.agent.id}`, { waitUntil: 'networkidle' })
  // tab 按钮声明的锚点（sec-config 等 onclick byId 目标）
  const tabTargets = await page.evaluate(() =>
    Array.from(document.querySelectorAll('button'))
      .map((b) => b.textContent ?? '')
      .filter((t) => ['配置', '技能', '文件', '知识库', '对话', '日志', '版本', '账号', 'Webhook'].includes(t.trim())),
  )
  assert.ok(tabTargets.length >= 5, `tab 按钮渲染（${tabTargets.length} 个）`)
  for (const label of tabTargets) {
    const map: Record<string, string> = {
      '配置': 'sec-config', '技能': 'sec-skills', '文件': 'sec-files',
      '知识库': 'sec-knowledge', '对话': 'sec-preview', '日志': 'sec-logs',
      '版本': 'sec-versions', '账号': 'sec-account', 'Webhook': 'sec-webhook',
    }
    const id = map[label.trim()]
    if (!id) continue
    const exists = await page.evaluate((i) => !!document.getElementById(i), id)
    assert.ok(exists, `tab「${label}」的锚点 #${id} 必须存在于 DOM（旧代码 sec-files/sec-knowledge 悬空——点击无反应）`)
  }
  // 旧代码声明但已移除的「文件」tab 不再出现
  assert.ok(!tabTargets.includes('文件'), '「文件」tab 已移除（文件在部门工作区管理——不在 Agent 详情页）')
  await page.close()
})

test('stats API 静默空数据防线：无效 appId 上下文 → 显式 401（不再 200 全 0）', async () => {
  // 平台登录 token（无 appId payload）请求 app 维度统计——旧行为 200 全 0
  // （用户看到「Agent 总数 0」静默错误）——修复后 401 走续期/重登录链
  const stamp = Date.now()
  const reg = await fetch(`${BASE}/api/auth/register-app`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: `stat401-${stamp}@e2e.test`, password: 'Test12345', name: 'S' }),
  })
  const regData = await reg.json()
  // 平台登录（/api/auth/login——签发无 appId 的平台 token）
  const login = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: `stat401-${stamp}@e2e.test`, password: 'Test12345' }),
  })
  const loginData = await login.json()
  assert.ok(loginData.token, '平台登录成功')
  const res = await fetch(`${BASE}/api/stats`, {
    headers: { Authorization: `Bearer ${loginData.token}` },
  })
  assert.equal(res.status, 401, '无 appId 上下文 → 显式 401（非 200 全 0 静默空）')
  void regData
})

test('BUG-1 回归：登录失败提示为中文文案（i18n 消息表已注册——非原始 key）', async () => {
  const page = await browser.newPage()
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
  await page.fill('input[type=email], input[placeholder*=example]', 'nouser-walk@e2e.test')
  await page.fill('input[type=password]', 'WrongPass999')
  await page.click('button[type=submit], button:has-text("登 录")')
  await page.waitForTimeout(800)
  const text = await page.evaluate(() => document.body.textContent ?? '')
  assert.ok(text.includes('邮箱或密码不正确'), '显示中文错误文案（APP_MESSAGES 已注册）')
  assert.ok(!text.includes('err.invalid_credentials'), '不显示原始 i18n key（BUG-1 回归防线）')
  await page.close()
})
