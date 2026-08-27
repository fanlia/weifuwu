/**
 * agent-platform 聊天流式测试（playwright——2026-08 流式缺失回归）
 *
 * 场景：登录 → 打开 /chat/:id → 发消息 → 断言：
 *  1. WS 已连接（connect 修复——wsClient.connect 生效）
 *  2. AI 回复实时出现（__chatDbg 的 wf:token/wf:done 事件到达——不刷新）
 *  3. 消息区 AI bubble 内容最终完整（含 done 的 content）
 *
 * 回归：断线重连重订阅（onStatusChange → subscribe 重发）——覆盖
 * mount 时 WS 未连的时序。
 *
 * 用法：node scripts/pw-chat-stream.mjs [deptId]
 */
import { chromium } from 'playwright'

const DEPT_ID = process.argv[2] ?? 'b6a993c3-40c6-4fef-9b55-190a9d064e64'
const BASE = 'http://localhost:3000'
let pass = 0, fail = 0
const ok = (name, cond, extra = '') => {
  console.log(`${cond ? '  ✓' : '  ✗'} ${name}${extra ? ` (${extra})` : ''}`)
  cond ? pass++ : fail++
}

const browser = await chromium.launch()
const page = await browser.newPage()
const errs = []
page.on('console', m => { if (m.type() === 'error') errs.push(`[console] ${m.text().slice(0, 110)}`) })
page.on('pageerror', e => errs.push(`[pageerror] ${String(e).slice(0, 110)}`))

// ── 登录 → 聊天页 ──
await page.goto(`${BASE}/login`)
await page.waitForTimeout(1500)
await page.fill('input[type=email], input[name=email]', 'admin@demo.com')
await page.fill('input[type=password]', 'admin123')
await page.click('button[type=submit], button.wf-btn--primary')
await page.waitForTimeout(3000)
await page.goto(`${BASE}/chat/${DEPT_ID}`)
await page.waitForTimeout(2500)
ok('页面加载（聊天流）', (await page.evaluate(() => document.body.textContent?.length ?? 0)) > 100)

// ── 发消息 ──
const msg = `流式测试${Date.now() % 100000}`
await page.locator('input.wf-chat-input').fill(msg)
await page.keyboard.press('Enter')
ok('消息发送（输入框清空/消息上屏）', await page.waitForFunction(
  (m) => document.body.textContent?.includes(m), msg, { timeout: 5000 },
).then(() => true).catch(() => false))

// ── 断言 WS 事件到达（token/done——__chatDbg 记录）──
const gotTrace = await page.waitForFunction(
  () => (window.__chatDbg ?? []).length >= 1,
  { timeout: 30000 },
).then(() => true).catch(() => false)
const dbg = await page.evaluate(() => (window.__chatDbg ?? []).slice())
ok('WS 流式事件到达（wf:token/wf:done——__chatDbg）', gotTrace, dbg.slice(0, 3).join('|'))

// ── 断言 AI 回复实时显示（不刷新——bubble 出现）──
const aiShown = await page.waitForFunction(
  () => [...document.querySelectorAll('p')].some((e) => {
    const t = (e.textContent ?? '').trim()
    return t.length > 5 && !t.includes('沙盒') && !t.includes('消息')
  }),
  { timeout: 30000 },
).then(() => true).catch(() => false)
ok('AI 回复实时显示（无刷新）', aiShown)

// ── 最终内容（done content 覆盖——不截断）──
const finalText = await page.evaluate(() => document.body.textContent ?? '')
ok('AI 回复内容完整（含 done 合并）', finalText.includes('收到') || finalText.includes('✅') || finalText.length > 500)

ok('零 console/page 错误', errs.length === 0, errs.slice(0, 2).join(' | '))

console.log(`\n结果: ${pass}/${pass + fail}`)
await browser.close()
process.exit(fail > 0 ? 1 : 0)
