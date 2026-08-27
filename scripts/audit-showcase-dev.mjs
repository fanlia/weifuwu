/**
 * showcase 全量 dev 审计——运行时检查基线（2026-08）
 *
 * 机制（全部 dev-only——生产零成本）：
 * - __WF_DEV__ 注入 → serve 挂载 devVerify（命令 Post 断言）+ effect guard
 *   （renderFn 同步段副作用检测——DemoProgress 类）
 * - 访问每个组件页（index.json 全量）→ 点击 demo 按钮（触发条件渲染/
 *   状态切换/浮层）→ 收集 [vdom] console warn/error：
 *   - 渲染路径副作用（renderFn 内 timer——零豁免）
 *   - 无 key 组件项误报 / 重复 key / 语义判定分裂
 *   - devVerify 违例（命令流 Post 断言——状态机/区间/id 空间）
 *   - 组件渲染零错误
 *
 * 输出：逐页进度（页码/耗时）+ 问题即时打印（debug 定位）——末尾汇总。
 * 用法：node scripts/audit-showcase-dev.mjs（SHOWCASE_URL 可配）
 * 退出码 1 = 违规（CI 可挂）。
 */
import { chromium } from 'playwright'
import { setTimeout as sleep } from 'node:timers/promises'

const BASE = process.env.SHOWCASE_URL ?? 'http://localhost:3200'
const CLICKS = Number(process.env.SCAN_CLICKS ?? 6)
const SLOW = process.env.SCAN_SLOW === '1' // 每页 200ms 间隔（性能诊断）

// **目标选择（快速 audit）**：裸 id 列表（`videoplayer math`）或
// `--ids=a,b` 或 `SCAN_IDS=a,b`——无参 = 全量
const argvIds = process.argv.slice(2).filter((a) => !a.startsWith('--'))
const flagIds = (process.argv.find((a) => a.startsWith('--ids=')) ?? '').slice(6)
const envIds = process.env.SCAN_IDS ?? ''
const targetIds = new Set([...argvIds, ...flagIds.split(','), ...envIds.split(',')].filter(Boolean))
// **分类过滤**：`--cat=input,display`（分批全量扫描）
const catFlag = (process.argv.find((a) => a.startsWith('--cat=')) ?? '').slice(6)
const targetCats = new Set(catFlag.split(',').filter(Boolean))

const idx = await fetch(`${BASE}/content/index.json`).then((r) => r.json()).catch(() => {
  console.error(`✖ index.json 不可达——请先启动 showcase server（${BASE}）`)
  process.exit(2)
})
const comps = (targetIds.size || targetCats.size)
  ? idx.components.filter((c) =>
      (targetIds.size ? [...targetIds].some((t) => c.id === t || c.id.includes(t)) : false) ||
      (targetCats.size ? targetCats.has(c.category) : false))
  : idx.components
if (targetIds.size) console.log(`目标 ${comps.length} 个组件（过滤: ${[...targetIds].join(', ')}）`)
const total = comps.length

const browser = await chromium.launch()
const issues = []
const stats = { pages: 0, clicks: 0, elapsed: Date.now() }

for (const [pi, c] of comps.entries()) {
  const path = `/components/${c.category}/${c.id}`
  const t0 = Date.now()
  const page = await browser.newPage()
  const pageErrs = []
  await page.addInitScript(() => { window.__WF_DEV__ = true })
  page.on('console', (m) => {
    const t = m.text()
    if (m.type() !== 'log' && t.includes('[vdom]')) pageErrs.push(`${c.id}: ${t.slice(0, 180)}`)
    else if (m.type() === 'error') pageErrs.push(`${c.id}: [error] ${t.slice(0, 140)}`)
  })
  let clicks = 0
  let status = 'ok'
  try {
    await page.goto(BASE + path, { timeout: 15000 })
    await page.waitForSelector('main .wf-surface', { timeout: 8000 })
    const btns = await page.locator('main .wf-surface button').count()
    for (let i = 0; i < Math.min(btns, CLICKS); i++) {
      try {
        await page.locator('main .wf-surface button').nth(i).click({ timeout: 900 })
        await sleep(80)
        clicks++
      } catch { /* 点击失败忽略 */ }
    }
    await sleep(150)
    stats.clicks += clicks
  } catch (e) {
    status = `fail:${String(e).slice(0, 60)}`
    pageErrs.push(`${c.id}: [page] ${String(e).slice(0, 100)}`)
  }
  stats.pages++
  if (SLOW) await sleep(200)
  // **逐页进度**（含问题即时打印——debug 定位）
  const ms = Date.now() - t0
  const problems = pageErrs.filter((e) => e.includes('渲染路径副作用'))
  const other = pageErrs.filter((e) => !e.includes('渲染路径副作用'))
  console.log(
    `[${String(pi + 1).padStart(3)}/${total}] ${c.id.padEnd(24)} btns:${String(clicks).padStart(2)} ` +
    `${ms}ms ${status === 'ok' ? '' : status}` +
    (pageErrs.length ? ` ⚠ ${pageErrs.length}（副作用${problems.length}/其他${other.length}）` : ''),
  )
  if (pageErrs.length) {
    issues.push({ id: c.id, errs: pageErrs })
    for (const e of pageErrs) console.log(`    └ ${e.slice(0, 180)}`)
  }
  await page.close()
}

await browser.close()
console.log('---')
const totalMs = ((Date.now() - stats.elapsed) / 1000).toFixed(1)
if (issues.length) {
  const side = issues.filter((i) => i.errs.some((e) => e.includes('渲染路径副作用'))).map((i) => i.id)
  const other = issues.filter((i) => !i.errs.some((e) => e.includes('渲染路径副作用'))).map((i) => i.id)
  console.log(`✖ ${stats.pages} 页 / ${stats.clicks} 次点击 / ${totalMs}s——${issues.length} 个组件有问题:`)
  if (side.length) console.log(`  渲染路径副作用（${side.length}）: ${side.join(', ')}`)
  if (other.length) console.log(`  其他 [vdom]（${other.length}）: ${other.join(', ')}`)
  process.exit(1)
} else {
  console.log(`✔ ${stats.pages} 页 / ${stats.clicks} 次点击 / ${totalMs}s——dev 模式全零 [vdom] 问题`)
}
