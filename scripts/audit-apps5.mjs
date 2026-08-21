import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
const browser = await chromium.launch()
const page = await browser.newPage()
const log = (ok, msg) => console.log((ok ? '✓' : '✖') + ' ' + msg)

async function check(dir, port, fn) {
  const s = spawn('node', ['server.ts'], { cwd: resolve('examples/apps/' + dir), stdio: ['ignore', 'pipe', 'pipe'] })
  let out = ''
  s.stdout.on('data', d => { out += String(d) })
  s.stderr.on('data', d => { out += '[ERR]' + String(d) })
  // 等 listening（最多 6s）
  for (let i = 0; i < 60 && !out.includes('listening') && !out.includes('ERR'); i++) await new Promise(r => setTimeout(r, 100))
  if (!out.includes('listening')) { log(false, `${dir}: server 未启动（${out.slice(0, 100)}）`); s.kill(); return }
  try {
    await page.goto(`http://localhost:${port}`, { waitUntil: 'domcontentloaded', timeout: 6000 })
    await page.waitForTimeout(600)
    await fn()
  } catch (e) { log(false, `${dir}: ${String(e).slice(0, 90)}`) }
  s.kill()
  await new Promise(r => setTimeout(r, 800))
}

await check('todo', 3300, async () => {
  const t = await page.evaluate(() => document.body.textContent ?? '')
  log(t.length > 100, `todo 启动（内容 ${t.length} 字符——任务渲染${/任务|待办/.test(t) ? '✓' : '✖'}）`)
  await page.evaluate(() => Array.from(document.querySelectorAll('button')).find(x => /新建|添加/.test(x.textContent ?? ''))?.click())
  await page.waitForTimeout(400)
  const input = page.locator('input:not([type=checkbox]), input[type=text]').first()
  const editable = await input.isEditable().catch(() => false)
  log(editable, `todo 新建表单可编辑`)
  if (editable) {
    await input.fill('巡检任务')
    await page.evaluate(() => Array.from(document.querySelectorAll('button')).find(x => /确定|保存|提交/.test(x.textContent ?? ''))?.click())
    await page.waitForTimeout(500)
    log(await page.evaluate(() => document.body.textContent?.includes('巡检任务')), `todo 新建落列表`)
  }
})

await check('auth', 3301, async () => {
  const types = await page.evaluate(() => Array.from(document.querySelectorAll('input')).map(i => i.type).join(','))
  log(types.includes('password'), `auth 登录表单（inputs: ${types || '无'}）`)
  await page.evaluate(() => { const i = Array.from(document.querySelectorAll('input')).find(x => x.type !== 'password'); if (i) { i.value = 'admin'; i.dispatchEvent(new Event('input', { bubbles: true })) } })
  await page.evaluate(() => { const i = Array.from(document.querySelectorAll('input')).find(x => x.type === 'password'); if (i) { i.value = 'admin123'; i.dispatchEvent(new Event('input', { bubbles: true })) } })
  await page.evaluate(() => Array.from(document.querySelectorAll('button')).find(x => /登录|登入/.test(x.textContent ?? ''))?.click())
  await page.waitForTimeout(700)
  const after = await page.evaluate(() => document.body.textContent ?? '')
  log(/登出|退出|欢迎|受保护/.test(after), `auth 登录→受保护页（${after.replace(/\s+/g, ' ').slice(0, 60)}）`)
})

await check('admin', 3302, async () => {
  const t = await page.evaluate(() => document.body.textContent ?? '')
  const nav = await page.evaluate(() => Array.from(document.querySelectorAll('a')).map(x => x.textContent?.trim()).filter(Boolean).slice(0, 6).join('/'))
  log(t.length > 100, `admin 启动（导航: ${nav || '无'}）`)
  await page.evaluate(() => { const a = Array.from(document.querySelectorAll('a')).find(x => /table|表格/i.test(x.textContent ?? '')); a?.click() })
  await page.waitForTimeout(500)
  log(await page.evaluate(() => !!document.querySelector('table')), `admin 表格页`)
})

await check('multi', 3303, async () => {
  const t = await page.evaluate(() => document.body.textContent ?? '')
  const btns = await page.evaluate(() => Array.from(document.querySelectorAll('button')).map(b => b.textContent?.trim()).slice(0, 5).join('/'))
  log(t.length > 100, `multi 启动（内容 ${t.length} 字符——按钮: ${btns || '无'}）`)
})

browser.close(); setTimeout(() => process.exit(0), 300)
