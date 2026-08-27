/**
 * agent-platform 全站跳转冒烟（playwright）
 *
 * 场景：登录（admin@demo.com）→ 遍历全部路由（goto 完整导航）
 * → 各页首屏等待 → 收集 console error / pageerror / 4xx-5xx 响应。
 *
 * 用法：node scripts/pw-smoke.mjs
 */
import { chromium } from 'playwright'

const BASE = 'http://localhost:3000'

const pages = [
  '/dashboard', '/agents', '/agents/new', '/agents/:id',
  '/templates', '/departments', '/departments/new', '/departments/:id',
  '/chat/new', '/chat/:id', '/approvals', '/sandboxes',
  '/reports', '/settings', '/admin', '/deliverables',
]

const browser = await chromium.launch()
const page = await browser.newPage()

const errors = []
const badResponses = []
page.on('console', (m) => { if (m.type() === 'error') errors.push(`[console] ${m.text().slice(0, 120)}`) })
page.on('pageerror', (e) => errors.push(`[pageerror] ${String(e).slice(0, 120)}`))
page.on('response', (r) => {
  if (r.status() >= 400) badResponses.push(`${r.status()} ${new URL(r.url()).pathname.slice(0, 70)}`)
})

// ── 登录 ──
await page.goto(`${BASE}/login`)
await page.waitForTimeout(1500)
await page.fill('input[type=email], input[name=email]', 'admin@demo.com')
await page.fill('input[type=password]', 'admin123')
await page.click('button[type=submit], button.wf-btn--primary')
await page.waitForTimeout(3000)
console.log('登录后 URL:', page.url())

// 拿真实 id（:id 路由需要有效数据）
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
    await page.goto(`${BASE}/${url.replace(/^\//, '')}`)
    await page.waitForTimeout(1200)
    const bodyLen = (await page.evaluate(() => document.body.textContent?.trim().length ?? 0)) ?? 0
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
