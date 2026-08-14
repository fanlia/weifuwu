/**
 * 模拟数据收集汇总——查看已提交的问卷数据（客户 demo）
 * 用法：node --env-file=.env scripts/survey-summary.mjs
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const dir = join(process.cwd(), 'data', 'survey-submissions')
if (!existsSync(dir)) {
  console.log('暂无提交数据（目录不存在）')
  process.exit(0)
}
const files = readdirSync(dir).filter((f) => f.endsWith('.json')).sort()
if (files.length === 0) {
  console.log('暂无提交数据')
  process.exit(0)
}

const records = files.map((f) => JSON.parse(readFileSync(join(dir, f), 'utf-8')))

// 统计
const ratingDist = {}
const industryDist = {}
const focusCount = {}
for (const r of records) {
  ratingDist[r.rating] = (ratingDist[r.rating] ?? 0) + 1
  industryDist[r.industry] = (industryDist[r.industry] ?? 0) + 1
  for (const f of r.focus ?? []) focusCount[f] = (focusCount[f] ?? 0) + 1
}

console.log(`\n=== 模拟数据收集汇总（${records.length} 份）===\n`)
console.log('满意度分布：', Object.entries(ratingDist).sort().map(([k, v]) => `${k} 分×${v}`).join(' · '))
console.log('行业分布：', Object.entries(industryDist).map(([k, v]) => `${k}×${v}`).join(' · '))
console.log('关注点：', Object.entries(focusCount).map(([k, v]) => `${k}×${v}`).join(' · '))
const avg = records.reduce((s, r) => s + r.rating, 0) / records.length
console.log(`平均满意度：${avg.toFixed(1)} / 5\n`)

console.log('明细：')
for (const r of records) {
  console.log(`  #${r.id} | ${r.industry} | ${r.age} | ${r.rating}分 | 关注[${(r.focus ?? []).join(',')}] | ${String(r.feedback ?? '').slice(0, 60)}`)
}
