// 应用模板本体功能巡检（examples/apps/* 独立 server）
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
const servers = []
function startApp(dir, port) {
  const s = spawn('node', ['--env-file=.env', 'examples/apps/' + dir + '/server.ts'], { cwd: process.cwd(), env: { ...process.env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'] })
  servers.push(s)
  return s
}
// 各模板 server 默认端口（README 查）
startApp('todo', 3300); startApp('auth', 3301); startApp('admin', 3302); startApp('multi', 3303)
await new Promise(r => setTimeout(r, 3000))
const browser = await chromium.launch()
const page = await browser.newPage()
const log = (ok, msg) => console.log((ok ? '✓' : '✖') + ' ' + msg)

// ── todo :3300 ──
try {
  await page.goto('http://localhost:3300', { waitUntil: 'domcontentloaded', timeout: 6000 }); await page.waitForTimeout(600)
  const t = await page.evaluate(() => document.body.textContent ?? '')
  log(t.length > 100, `todo 应用启动（内容 ${t.length} 字符——含"任务/待办"${/任务|待办/.test(t) ? '✓' : '✖'}）`)
  // 新建任务
  const addBtn = await page.evaluate(() => { const b = Array.from(document.querySelectorAll('button')).find(x => /新建|添加/.test(x.textContent ?? '')); return b ? (b.click(), true) : false })
  await page.waitForTimeout(400)
  const inputs = await page.locator('input').count()
  log(addBtn && inputs > 0, `todo 新建入口（表单 ${inputs} input）`)
  if (inputs > 0) {
    const editable = await page.locator('input:not([type=checkbox]), input[type=text]').first().isEditable().catch(() => false)
    log(editable, `todo 新建表单可编辑`)
    if (editable) {
      await page.locator('input:not([type=checkbox]), input[type=text]').first().fill('巡检任务')
      await page.evaluate(() => Array.from(document.querySelectorAll('button')).find(x => /确定|保存|提交/.test(x.textContent ?? ''))?.click())
      await page.waitForTimeout(500)
      const has = await page.evaluate(() => document.body.textContent?.includes('巡检任务'))
      log(has, `todo 新建落列表`)
    }
  }
} catch (e) { log(false, `todo: ${String(e).slice(0, 90)}`) }

// ── auth :3301 ──
try {
  await page.goto('http://localhost:3301', { waitUntil: 'domcontentloaded', timeout: 6000 }); await page.waitForTimeout(600)
  const form = await page.evaluate(() => Array.from(document.querySelectorAll('input')).map(i => i.type).join(','))
  log(form.includes('password'), `auth 登录表单（inputs: ${form || '无'}）`)
  await page.evaluate(() => { const i = Array.from(document.querySelectorAll('input')).find(x => x.type !== 'password'); if (i) { i.value = 'admin'; i.dispatchEvent(new Event('input', { bubbles: true })) } })
  await page.evaluate(() => { const i = Array.from(document.querySelectorAll('input')).find(x => x.type === 'password'); if (i) { i.value = 'admin123'; i.dispatchEvent(new Event('input', { bubbles: true })) } })
  await page.evaluate(() => Array.from(document.querySelectorAll('button')).find(x => /登录|登入/.test(x.textContent ?? ''))?.click())
  await page.waitForTimeout(600)
  const after = await page.evaluate(() => document.body.textContent ?? '')
  log(/登出|退出|欢迎|受保护/.test(after), `auth 登录→受保护页（${after.replace(/\s+/g, ' ').slice(0, 50)}）`)
} catch (e) { log(false, `auth: ${String(e).slice(0, 90)}`) }

// ── admin :3302 ──
try {
  await page.goto('http://localhost:3302', { waitUntil: 'domcontentloaded', timeout: 6000 }); await page.waitForTimeout(600)
  const t2 = await page.evaluate(() => document.body.textContent ?? '')
  const nav = await page.evaluate(() => Array.from(document.querySelectorAll('a')).map(x => x.textContent?.trim()).filter(Boolean).slice(0, 6).join('/'))
  log(t2.length > 100 && nav, `admin 启动（导航: ${nav}）`)
  await page.evaluate(() => { const a = Array.from(document.querySelectorAll('a')).find(x => /table|表格/i.test(x.textContent ?? '')); a?.click() })
  await page.waitForTimeout(500)
  const table = await page.evaluate(() => !!document.querySelector('table'))
  log(table, `admin 表格页`)
} catch (e) { log(false, `admin: ${String(e).slice(0, 90)}`) }

// ── multi :3303 ──
try {
  await page.goto('http://localhost:3303', { waitUntil: 'domcontentloaded', timeout: 6000 }); await page.waitForTimeout(600)
  const t3 = await page.evaluate(() => document.body.textContent ?? '')
  log(t3.length > 100, `multi 启动（内容 ${t3.length} 字符）`)
  const btns = await page.evaluate(() => Array.from(document.querySelectorAll('button')).map(b => b.textContent?.trim()).slice(0, 6).join('/'))
  log(btns.length > 0, `multi 交互入口（${btns}）`)
} catch (e) { log(false, `multi: ${String(e).slice(0, 90)}`) }

for (const s of servers) s.kill()
browser.close(); setTimeout(() => process.exit(0), 300)
