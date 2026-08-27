/**
 * agent-platform 全站跳转冒烟（puppeteer-core——复用既有 Chromium）
 *
 * 场景：登录（admin@demo.com）→ 遍历全部路由（goto 跳转——每次完整导航）
 * → 各页首屏等待 → 收集 console error / pageerror / 4xx-5xx 响应。
 *
 * 用法：node scripts/puppeteer-smoke.mjs
 */
import puppeteer from 'puppeteer-core'
import { execSync } from 'node:child_process'

const CHROME = execSync('find ~/.cache/ms-playwright -name chrome -type f 2>/dev/null | head -1').toString().trim()
const BASE = 'http://localhost:3000'

const pages = [
  '/dashboard', '/agents', '/agents/new', '/agents/:id',
  '/templates', '/departments', '/departments/new', '/departments/:id',
  '/chat/new', '/chat/:id', '/approvals', '/sandboxes',
  '/reports', '/settings', '/admin', '/deliverables',
]

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
})
const page = await browser.newPage()

const errors = []
const badResponses = []
page.on('console', (msg) => { if (msg.type() === 'error') errors.push(`[console] ${msg.text().slice(0, 120)}`) })
page.on('pageerror', (err) => errors.push(`[pageerror] ${String(err).slice(0, 120)}`))
page.on('response', (res) => {
  const status = res.status()
  if (status >= 400) badResponses.push(`${status} ${new URL(res.url()).pathname.slice(0, 70)}`)
})

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ── 登录 ──
await page.goto(`${BASE}/login`, { waitUntil: 'networkidle2', timeout: 30000 })
await sleep(500)
await page.type('input[type=email], input[name=email]', 'admin@demo.com')
await page.type('input[type=password]', 'admin123')
await page.click('button[type=submit], button.wf-btn--primary')
await sleep(3000)
console.log('登录后 URL:', page.url())

// 拿真实 id（chat/agents/departments 的 :id 路由需要有效数据）
const ids = await page.evaluate(async () => {
  const get = async (u) => (await fetch(u)).json()
  const deps = (await get('/api/departments'))?.departments ?? []
  const agents = (await get('/api/agents'))?.agents ?? []
  return {
    dept: deps[0]?.id ?? '',
    agent: agents.find((a) => a.type === 'ai')?.id ?? agents[0]?.id ?? '',
  }
})
console.log('数据 id:', JSON.stringify(ids))

// ── 遍历跳转 ──
let failed = 0
for (const p of pages) {
  const url = p.replace(':id', ids.dept || ids.agent) || p
  try {
    await page.goto(`${BASE}/${url.replace(/^\//, '')}`, { waitUntil: 'networkidle2', timeout: 30000 })
    await sleep(1200)
    const bodyLen = (await page.evaluate(() => document.body.textContent?.trim().length ?? 0))
    const ok = bodyLen > 30
    if (!ok) failed++
    console.log(`${ok ? '✓' : '✗'} /${url.replace(/^\//, '')}  body=${bodyLen}ch`)
  } catch (e) {
    failed++
    console.log(`✗ /${url} 跳转异常: ${String(e).slice(0, 100)}`)
  }
}

// ── 结果 ──
console.log('\n=== 结果 ===')
console.log(`页面跳转: ${pages.length - failed}/${pages.length} 通过`)
console.log('console/page errors:', errors.length ? errors.slice(0, 6) : '零')
console.log('4xx/5xx 响应:', badResponses.length ? badResponses.slice(0, 6) : '零')

await browser.close()
process.exit(failed > 0 || errors.length > 0 ? 1 : 0)
