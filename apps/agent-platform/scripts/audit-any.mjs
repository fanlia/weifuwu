/**
 * as any 审计线（platform W0——黄报不阻断——可见性防线）
 *
 * 语义：扫描 src/ui/server.ts 的 `: any` / `as any`——报告计数 + top 分布。
 * 基线 469（W0 探针锚）——只报不拦（开发中理性新增难免——黄报可见——
 * W2 分域清理降低；新增面在报告中可追踪）。
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const SCOPES = ['src', 'ui']
const files = []
const walk = (d) => { for (const f of readdirSync(d)) { const p = join(d, f); statSync(p).isDirectory() ? walk(p) : ((f.endsWith('.ts') || f.endsWith('.tsx')) && files.push(p)) } }
for (const sc of SCOPES) walk(sc)
files.push('server.ts')

const perFile = new Map()
let total = 0
for (const f of files) {
  const s = readFileSync(f, 'utf8')
  const n = (s.match(/: any\b|as any\b/g) ?? []).length
  if (n > 0) { perFile.set(f, n); total += n }
}
const top = [...perFile.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)
console.log(`as any 合计: ${total}（基线 469——W2 目标 ~350）`)
console.log(`高浓度前 8:`)
for (const [f, n] of top) console.log(`  ${n}  ${f}`)
if (total > 516) console.warn(`⚠ 超基线 10%+（${total} > 516）——新增面需要自查`)
console.log('audit:any 黄报完成（不阻断）')
