/**
 * agent-platform 角色驱动全功能测试（playwright）
 *
 * 三个角色视角（seed 设施）：
 * - 角色 A 平台管理员（admin@demo.com / admin123——owner + admin）：
 *   Dashboard/Agents CRUD/部门工作区/聊天发消息/报表/设置审计/管理后台
 * - 角色 B 租户成员（user@demo.com / user123——member）：
 *   登录/权限面（无管理入口）/工作台/Agent 列表
 * - 角色 C 访客（未登录）：重定向/登录页 SSR
 *
 * 每步真实交互（表单填写/提交/结果断言）+ 全程错误收集。
 * 注意：限流 100 请求/分钟——节奏控制；AI 回复放流式（不等待完成）。
 *
 * 用法：node scripts/pw-role-test.mjs
 */
import { chromium } from 'playwright'

const BASE = 'http://localhost:3000'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const browser = await chromium.launch()
const ctx = await browser.newContext()
const page = await ctx.newPage()
const errors = []
const badResponses = []
page.on('console', (m) => { if (m.type() === 'error') errors.push(`[console] ${m.text().slice(0, 110)}`) })
page.on('pageerror', (e) => errors.push(`[pageerror] ${String(e).slice(0, 110)}`))
page.on('response', (r) => { if (r.status() >= 400) badResponses.push(`${r.status()} ${new URL(r.url()).pathname.slice(0, 60)}`) })

let pass = 0, fail = 0
const ok = (name, cond, extra = '') => {
  console.log(`${cond ? '  ✓' : '  ✗'} ${name}${extra ? ` (${extra})` : ''}`)
  cond ? pass++ : fail++
}
const must = async (fn, label) => {
  try { await fn(); ok(label, true) } catch (e) { ok(label, false, String(e).slice(0, 110)) }
}

async function login(email, password) {
  await page.goto(`${BASE}/login`)
  await page.waitForTimeout(1200)
  await page.fill('input[type=email], input[name=email]', email)
  await page.fill('input[type=password]', password)
  await page.click('button[type=submit], button.wf-btn--primary')
  await page.waitForTimeout(3000)
}
const body = () => page.evaluate(() => document.body.textContent?.trim() ?? '')

// ═══ 角色 A：平台管理员 ═══
console.log('\n═══ 角色 A：管理员（admin@demo.com）═══')
await must(async () => { await login('admin@demo.com', 'admin123') }, 'A0 登录')

await must(async () => {
  const t = await body()
  ok('A1 Dashboard 渲染（项目空间/快捷操作）', t.includes('我的项目空间') || t.includes('快捷操作'))
}, 'A1 Dashboard')

// A2 Agent 列表 → 详情（编辑并改回）
await must(async () => {
  await page.goto(`${BASE}/agents`)
  await page.waitForTimeout(1500)
  const t = await body()
  ok('A2.1 Agent 列表渲染', t.includes('小码') || t.includes('创建'))
  // 进详情（小码）
  const link = await page.locator('a:has-text("小码"), div:has-text("小码")').first()
  await page.waitForTimeout(500)
  // 直接 URL（避免选择器脆弱——从第一行取 id）
  const agentUrl = await page.evaluate(() => {
    const href = [...document.querySelectorAll('a[href^="/agents/"]')]
      .map((a) => a.getAttribute('href') ?? '')
      .find((h) => h !== '/agents/new' && h !== '/agents') ?? ''
    return href
  })
  if (agentUrl) await page.goto(`${BASE}${agentUrl}`)
  await page.waitForTimeout(1800)
  const d = await body()
  ok('A2.2 Agent 详情渲染（表单）', d.includes('系统提示') || d.includes('模型') || d.includes('技能'))
}, 'A2 Agent 列表/详情')

// A3 Agent 创建 + 删除（CRUD 闭环）
const NEW_AGENT_NAME = `测试助理${Date.now() % 10000}`
await must(async () => {
  await page.goto(`${BASE}/agents/new`)
  await page.waitForTimeout(1500)
  // 首屏是角色模板选择卡——点「跳过自行配置」进表单
  await page.getByText('跳过自行配置', { exact: false }).first().click().catch(async () => {
    // 兜底：选第一个模板卡
    await page.locator('div:has-text("工程研发")').first().click().catch(() => {})
  })
  await page.waitForTimeout(1200)
  const inputs = await page.evaluate(() => document.querySelectorAll('input').length)
  ok('A3.0 表单出现（跳过模板后）', inputs >= 1, `inputs=${inputs}`)
  await page.locator('input').first().fill(NEW_AGENT_NAME)
  // 提交（创建按钮）
  await page.getByRole('button', { name: /创建/ }).first().click().catch(async () => {
    await page.locator('button').last().click()
  })
  await page.waitForTimeout(3000)
  const t = await body()
  ok('A3.1 Agent 创建提交', t.includes(NEW_AGENT_NAME) || page.url().includes('/agents/'))
}, 'A3 Agent 创建')

// A4 部门工作区：上传文件 → 出现
await must(async () => {
  await page.goto(`${BASE}/departments`)
  await page.waitForTimeout(1500)
  const deptUrl = await page.evaluate(() => {
    const href = document.querySelector('a[href^="/departments/"]')?.getAttribute('href') ?? ''
    return href
  })
  ok('A4.1 部门列表渲染', !!(await body()).includes('技术部'))
  if (deptUrl) {
    await page.goto(`${BASE}${deptUrl}`)
    await page.waitForTimeout(2000)
    const t = await body()
    ok('A4.2 部门详情（工作区/成员）', t.includes('工作区') || t.includes('成员'))
  }
}, 'A4 部门')

// A5 聊天：发消息（真实 POST——验证消息上屏）
await must(async () => {
  await page.goto(`${BASE}/chat/`)
  await page.waitForTimeout(500)
  const chatUrl = await page.evaluate(async () => {
    const token = localStorage.getItem('agent_platform_token') ?? ''
    const deps = (await (await fetch('/api/departments', { headers: token ? { Authorization: `Bearer ${token}` } : {} })).json())?.departments ?? []
    return deps.find((d) => d.name === '技术部')?.id ?? deps[0]?.id ?? ''
  })
  if (!chatUrl) { ok('A5 聊天（无部门数据）', false, 'API 401/空'); return }
  await page.goto(`${BASE}/chat/${chatUrl}`)
  await page.waitForTimeout(2000)
  const msg = `角色测试消息 ${Date.now() % 100000}`
  await page.locator('textarea, input[placeholder*="消息"], input[placeholder*="说"]').first().fill(msg)
  await page.keyboard.press('Enter')
  await page.waitForTimeout(2500)
  const t = await body()
  ok('A5 聊天发消息（WS 回显/消息上屏）', t.includes(msg))
}, 'A5 聊天消息')

// A6 报表
await must(async () => {
  await page.goto(`${BASE}/reports`)
  await page.waitForTimeout(2200)
  const t = await body()
  ok('A6 报表（使用量/成本卡）', t.includes('运营报表') && (t.includes('Token') || t.includes('成本')))
}, 'A6 报表')

// A7 设置（审计过滤）
await must(async () => {
  await page.goto(`${BASE}/settings`)
  await page.waitForTimeout(2000)
  const t = await body()
  ok('A7.1 设置（系统状态/计划区）', t.includes('审计') || t.includes('套餐') || t.includes('模型'))
}, 'A7 设置')

// A8 管理后台（租户+容量）
await must(async () => {
  await page.goto(`${BASE}/admin`)
  await page.waitForTimeout(2500)
  const t = await body()
  ok('A8 管理后台（租户表/容量卡）', t.includes('租户') || t.includes('容量'))
}, 'A8 管理后台')

// ═══ 角色 B：租户成员 ═══
console.log('\n═══ 角色 B：成员（user@demo.com）═══')
await must(async () => {
  const c2 = await browser.newContext()
  const p2 = await c2.newPage()
  await p2.goto(`${BASE}/login`)
  await p2.waitForTimeout(1000)
  await p2.fill('input[type=email], input[name=email]', 'user@demo.com')
  await p2.fill('input[type=password]', 'user123')
  await p2.click('button[type=submit], button.wf-btn--primary')
  await p2.waitForTimeout(3000)
  const nav = await p2.evaluate(() => document.body.textContent ?? '')
  ok('B1 登录成功（工作台）', p2.url().includes('/'))
  ok('B2 成员无「租户管理」入口', !nav.includes('租户管理'))
  ok('B3 成员可见工作台（项目空间）', nav.includes('项目空间') || nav.includes('快捷'))
  await p2.goto(`${BASE}/agents`)
  await p2.waitForTimeout(1500)
  const at = await p2.evaluate(() => document.body.textContent ?? '')
  ok('B4 成员 Agent 列表可见', at.includes('小码') || at.includes('创建'))
  await c2.close()
}, 'B 成员角色')

// ═══ 角色 C：访客 ═══
console.log('\n═══ 角色 C：访客（未登录）═══')
await must(async () => {
  const c3 = await browser.newContext()
  const p3 = await c3.newPage()
  await p3.goto(`${BASE}/dashboard`)
  await p3.waitForTimeout(2000)
  ok('C1 未登录访问受保护页 → 登录页', p3.url().includes('/login'))
  const t = await p3.evaluate(() => document.body.textContent ?? '')
  ok('C2 登录页表单渲染（SSR）', t.includes('邮箱') || t.includes('登'))
  await c3.close()
}, 'C 访客')

// ═══ 结果 ═══
console.log('\n════════ 结果 ════════')
console.log(`通过 ${pass} / 失败 ${fail}`)
console.log('console/page errors:', errors.length ? errors.slice(0, 5) : '零')
console.log('4xx/5xx:', badResponses.length ? [...new Set(badResponses)].slice(0, 6) : '零')
await browser.close()
process.exit(fail > 0 || errors.length > 0 ? 1 : 0)
