/**
 * 主页面渲染基线测试（OPTIMIZE-PLAN-3 重写——对齐 weifuwu/vdom 测试纪律）
 *
 * 旧形态（jsdom + ui-dom createRouter）随框架重构删除——新形态 = 场景层纪律：
 * **playwright + 真实 server（uiServe）**——真实浏览器渲染管线 + 真实认证/
 * 数据链路（注册租户 → API 种子 → localStorage 注入 → 页面断言）。
 *
 * 基线覆盖（原 UI-REFACTOR-PLAN M1 保护网全量保留）：
 * - Login/Register：A1 首屏 SSR（零 JS 即表单）+ 水合后吸收零错误
 * - Workspace：项目空间卡片（有数据）/ 空状态三步引导（新租户）
 * - Settings：四卡（基本资料/外观/审计/系统状态）
 * - AgentDetail：ai 类型分区基线 + 错误态（不存在/无权）
 *
 * 单独运行：node --env-file=.env --test apps/agent-platform/test/ui/pages.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import {
  startAgentServer, openAgentPage, fatalErrors, waitForText,
  registerTenant, injectAuth, apiAs,
  type AgentServer, type TenantAuth,
} from './shared.ts'

let server: AgentServer
let browser: Browser
let BASE = ''
/** 种子租户（部门 + AI Agent——Workspace/Settings/AgentDetail 共用） */
let seeded: TenantAuth
let seededDeptId = ''
let seededAgentId = ''
/** 空租户（无部门——空状态引导） */
let empty: TenantAuth

test.before(async () => {
  server = await startAgentServer()
  BASE = server.base
  browser = await chromium.launch()

  seeded = await registerTenant(BASE, 'seeded')
  const dept = await apiAs(BASE, seeded, '/api/departments', {
    method: 'POST', body: JSON.stringify({ name: '技术部' }),
  })
  seededDeptId = dept.department.id
  const agent = await apiAs(BASE, seeded, '/api/agents', {
    method: 'POST',
    body: JSON.stringify({ type: 'ai', name: '测试 Agent', description: '测试描述', system_prompt: '你是测试助手' }),
  })
  seededAgentId = agent.agent.id

  empty = await registerTenant(BASE, 'empty')
})

test.after(async () => {
  await browser?.close()
  server?.stop()
})

// ── Login / Register：A1 首屏 SSR ─────────────────────────

test('Login SSR 基线：零 JS 即表单（HTML 直取）+ 水合吸收零错误', async () => {
  // SSR 断言：node 直取 HTML（无浏览器——JS 未执行）——首屏即完整表单
  const html = await (await fetch(`${BASE}/login`)).text()
  assert.ok(html.includes('登'), 'SSR 标题含「登」')
  assert.ok(html.includes('立即注册'), 'SSR 注册入口')
  assert.ok(html.includes('<input'), 'SSR 输入框（零 JS 即可见）')

  // 浏览器水合：uiServe 吸收 SSR 结构——表单保持 + 零 console 错误
  const page = await browser.newPage()
  try {
    const errors = await openAgentPage(page, BASE, '/login')
    await waitForText(page, '立即注册')
    assert.ok(await page.locator('input').count() > 0, '水合后输入框存在')
    assert.deepEqual(fatalErrors(errors), [], `零错误（实际: ${fatalErrors(errors)[0] ?? '无'}）`)
  } finally { await page.close() }
})

test('Register SSR 基线：零 JS 即表单', async () => {
  const html = await (await fetch(`${BASE}/register`)).text()
  assert.ok(html.includes('创建账号'), 'SSR 标题（无邀请态 = 创建账号）')
  assert.ok(html.includes('<input'), 'SSR 输入框（零 JS 即可见）')

  const page = await browser.newPage()
  try {
    const errors = await openAgentPage(page, BASE, '/register')
    assert.deepEqual(fatalErrors(errors), [], `零错误（实际: ${fatalErrors(errors)[0] ?? '无'}）`)
  } finally { await page.close() }
})

// ── Workspace（工作台）────────────────────────────────────

test('工作台基线：项目空间卡片 + 新建入口（种子租户）', async () => {
  const page = await browser.newPage()
  try {
    await injectAuth(page, seeded)
    const errors = await openAgentPage(page, BASE, '/')
    await waitForText(page, '我的项目空间')
    const text = await page.evaluate(() => document.body.textContent ?? '')
    assert.ok(text.includes('技术部'), '项目卡片（部门名）')
    assert.ok(text.includes('新建项目空间'), '创建入口')
    assert.deepEqual(fatalErrors(errors), [], `零错误（实际: ${fatalErrors(errors)[0] ?? '无'}）`)
  } finally { await page.close() }
})

test('工作台空状态：无项目空间 → 三步引导（空租户）', async () => {
  const page = await browser.newPage()
  try {
    await injectAuth(page, empty)
    const errors = await openAgentPage(page, BASE, '/')
    await waitForText(page, '还没有项目空间')
    const text = await page.evaluate(() => document.body.textContent ?? '')
    assert.ok(text.includes('三步开始'), '引导文案')
    assert.deepEqual(fatalErrors(errors), [], `零错误（实际: ${fatalErrors(errors)[0] ?? '无'}）`)
  } finally { await page.close() }
})

// ── Settings ──────────────────────────────────────────────

test('Settings 基线：四卡（基本资料/外观/审计日志/系统状态）', async () => {
  const page = await browser.newPage()
  try {
    await injectAuth(page, seeded)
    const errors = await openAgentPage(page, BASE, '/settings')
    await waitForText(page, '基本资料')
    const text = await page.evaluate(() => document.body.textContent ?? '')
    for (const t of ['基本资料', '外观', '审计日志', '系统状态']) {
      assert.ok(text.includes(t), `卡片：${t}`)
    }
    assert.ok(text.includes('全部时间'), 'C3 时间范围筛选（全部时间选项）')
    assert.deepEqual(fatalErrors(errors), [], `零错误（实际: ${fatalErrors(errors)[0] ?? '无'}）`)
  } finally { await page.close() }
})

// ── AgentDetail ───────────────────────────────────────────

test('AgentDetail 基线：ai 类型分区 + 数据回填（种子 Agent）', async () => {
  const page = await browser.newPage()
  try {
    await injectAuth(page, seeded)
    const errors = await openAgentPage(page, BASE, `/agents/${seededAgentId}`)
    // 分区异步加载（子组件各自 await 取数）——等最晚的「执行日志」出现再全量断言
    await waitForText(page, '执行日志')
    const text = await page.evaluate(() => document.body.textContent ?? '')
    // ai 类型分区（工作空间文件区已迁至部门页——三层模型）
    for (const t of ['基本设置', '技能管理', '绑定知识库', '测试对话', '执行日志', '版本管理']) {
      assert.ok(text.includes(t), `分区：${t}`)
    }
    assert.ok(!text.includes('工作空间文件'), '文件区已迁至部门详情页（三层模型）')
    assert.ok(!text.includes('入站端点'), 'ai 类型无 Webhook 区')
    // 数据回填（名称 + 系统提示——textarea 走 property 通道）
    assert.ok(text.includes('测试 Agent'), '名称回填')
    const taValues = await page.evaluate(() =>
      [...document.querySelectorAll('textarea')].map((t) => (t as HTMLTextAreaElement).value).join('|'))
    assert.ok(taValues.includes('你是测试助手'), '系统提示回填（textarea value）')
    assert.deepEqual(fatalErrors(errors), [], `零错误（实际: ${fatalErrors(errors)[0] ?? '无'}）`)
  } finally { await page.close() }
})

test('AgentDetail 错误态：不存在 → 非空表单（EmptyState）', async () => {
  const page = await browser.newPage()
  try {
    await injectAuth(page, seeded)
    const errors = await openAgentPage(page, BASE, '/agents/00000000-0000-0000-0000-000000000000')
    await waitForText(page, '不存在或无权访问')
    const text = await page.evaluate(() => document.body.textContent ?? '')
    assert.ok(!text.includes('基本设置'), '不渲染空表单')
    assert.deepEqual(fatalErrors(errors), [], `零错误（实际: ${fatalErrors(errors)[0] ?? '无'}）`)
  } finally { await page.close() }
})
