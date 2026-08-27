/**
 * agent-platform CSV 工具调用流程测试（playwright——2026-08 工具优化回归）
 *
 * 背景：用户问「订单.csv 有多少条数据」——修复前 AI 走 4 步低效流程：
 *   list_files → read_csv（失败：文件不存在——路径 appId 错）→ bash
 *   ls/cat 兜底 → bash python3 统计——修复后 read_csv 一步直达。
 *
 * 断言：
 *  1. AI 回复含「条数据」（read_csv 成功语义——rowCount 输出）
 *  2. 回复不含「文件不存在」（read_csv 失败兜底不再发生）
 *  3. 流式无错误（WS 连接正常——此前修复）
 *
 * 用法：node scripts/pw-csv-flow.mjs [deptId]
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
page.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 100)) })

await page.goto(`${BASE}/login`)
await page.waitForTimeout(1500)
await page.fill('input[type=email], input[name=email]', 'admin@demo.com')
await page.fill('input[type=password]', 'admin123')
await page.click('button[type=submit], button.wf-btn--primary')
await page.waitForTimeout(3000)
await page.goto(`${BASE}/chat/${DEPT_ID}`)
await page.waitForTimeout(2500)

// 发消息（与用户报告相同）
await page.locator('input.wf-chat-input').fill('看一下  订单.csv 有多少条数据')
await page.keyboard.press('Enter')

// 等待 AI 回复（read_csv 成功语义）
const replied = await page.waitForFunction(
  () => {
    const t = document.body.textContent ?? ''
    return /条数据|条记录|行/.test(t) && t.includes('订单.csv')
  },
  { timeout: 90000 },
).then(() => true).catch(() => false)
ok('AI 回复到达（含行数结果）', replied)

const text = await page.evaluate(() => document.body.textContent ?? '')
const m = text.match(/(共|共计|总)[^，。]{0,20}?(\d+)\s*条/)
ok('回复含数据条数', !!m, m ? `「${m[0]}」` : '')
ok('无「文件不存在」（read_csv 未失败兜底）', !text.includes('文件不存在'))
ok('无 bash 兜底痕迹（ls -la /ws）', !text.includes('ls -la'))
ok('零 console 错误', errs.length === 0, errs.slice(0, 2).join(' | '))

console.log(`\n结果: ${pass}/${pass + fail}`)
await browser.close()
process.exit(fail > 0 ? 1 : 0)
