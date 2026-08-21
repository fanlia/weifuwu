// 应用模块功能巡检：todo/auth/admin/multi/agent-platform
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
const s = spawn('node', ['apps/showcase/server.ts'], { cwd: process.cwd(), env: { ...process.env, PORT: '3299' }, stdio: ['ignore', 'pipe', 'pipe'] })
await new Promise(r => setTimeout(r, 2500))
const browser = await chromium.launch()
const page = await browser.newPage()
const errs = []
page.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 100)) })
page.on('pageerror', e => errs.push(String(e).slice(0, 130)))
const BASE = 'http://localhost:3299'
const log = (ok, msg) => console.log((ok ? '✓' : '✖') + ' ' + msg)

// ── 1. todo：列表 → 新建 → 列表更新 ──
await page.goto(BASE + '/apps/todo', { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(500)
const todoBefore = await page.evaluate(() => document.querySelectorAll('main li, main [class*=item]').length)
log(todoBefore > 0, `todo 列表渲染（${todoBefore} 项）`)
const addBtn = await page.evaluate(() => {
  const b = Array.from(document.querySelectorAll('main button')).find(x => /新建|添加|新增/.test(x.textContent ?? ''))
  return b ? b.click() : false
})
await page.waitForTimeout(300)
const inputVisible = await page.evaluate(() => !!document.querySelector('main input'))
log(addBtn && inputVisible, `todo 新建入口（表单出现）`)
if (inputVisible) {
  await page.fill('main input', '巡检任务-测试')
  await page.evaluate(() => Array.from(document.querySelectorAll('main button')).find(x => /确定|保存|提交|创建/.test(x.textContent ?? ''))?.click())
  await page.waitForTimeout(400)
  const has = await page.evaluate(() => document.body.textContent?.includes('巡检任务-测试'))
  log(has, `todo 新建任务落列表`)
}

// ── 2. auth：登录 → 受保护页 → 登出 ──
await page.goto(BASE + '/apps/auth', { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(500)
const authForm = await page.evaluate(() => !!document.querySelector('main input'))
log(authForm, `auth 登录表单渲染`)
await page.evaluate(() => { const i = document.querySelector('main input'); if (i) i.value = 'admin'; i?.dispatchEvent(new Event('input', { bubbles: true })) })
await page.fill('main input', 'admin')
const pwd = await page.evaluate(() => Array.from(document.querySelectorAll('main input')).length)
if (pwd > 1) await page.fill('main input[type=password], main input:nth-of-type(2)', 'admin123')
await page.evaluate(() => Array.from(document.querySelectorAll('main button')).find(x => /登录|登入|login/i.test(x.textContent ?? ''))?.click())
await page.waitForTimeout(500)
const loggedIn = await page.evaluate(() => /登出|logout|欢迎|dashboard|欢迎,/.test(document.body.textContent ?? '') )
log(loggedIn, `auth 登录成功（${(await page.evaluate(() => document.body.textContent?.slice(0, 100)))?.replace(/\s+/g, ' ').slice(0, 60)}）`)

// ── 3. admin：Dashboard → 侧边导航到表格/表单 ──
await page.goto(BASE + '/apps/admin', { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(500)
const dash = await page.evaluate(() => document.body.textContent?.includes('Dashboard') || document.body.textContent?.includes('仪表盘'))
log(dash, `admin Dashboard 渲染`)
const navLinks = await page.evaluate(() => Array.from(document.querySelectorAll('main a')).map(x => x.textContent?.trim()).filter(Boolean).slice(0, 8))
log(navLinks.length > 0, `admin 侧边导航（${navLinks.join('/')}）`)
const tableNav = await page.evaluate(() => { const a = Array.from(document.querySelectorAll('main a')).find(x => /table|表格/i.test(x.textContent ?? '')); return a ? (a.click(), true) : false })
await page.waitForTimeout(400)
const hasTable = await page.evaluate(() => !!document.querySelector('main table'))
log(tableNav && hasTable, `admin → Table 页`)

// ── 4. multi：子应用嵌入 ──
await page.goto(BASE + '/apps/multi', { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(500)
const subApp = await page.evaluate(() => (document.body.textContent ?? '').length)
log(subApp > 200, `multi 编排渲染（内容 ${subApp} 字符）`)

// ── 5. agent-platform：登录 + 主界面 ──
await page.goto(BASE + '/apps/agent-platform', { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(600)
const ap = await page.evaluate(() => (document.body.textContent ?? '').replace(/\s+/g, ' ').slice(0, 150))
log(ap.length > 50, `agent-platform 渲染（${ap.slice(0, 60)}…）`)

console.log('\nconsole errors:', errs.length ? errs.slice(0, 5) : 'NONE')
browser.close(); s.kill(); setTimeout(() => process.exit(0), 300)
