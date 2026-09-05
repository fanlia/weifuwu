/**
 * route 测试覆盖哨兵（fullstack W3——黄报不阻断——可见性防线）
 *
 * 语义：每一条 route 路径必须被测试「直接引用」（字符串出现——handler 直调
 * 的 Request URL / 真 server的 fetch——口径一致）——未引用 = 黄（warn 清单）。
 * 存量历史面（52% 未引用）保持黄——新 route 纪律：必须带测试（AGENTS.md）。
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROUTE_FILES = ['src/routes/agents.ts', 'src/routes/messages.ts', 'src/routes/departments.ts',
  'src/routes/admin.ts', 'src/routes/sandboxes.ts', 'src/routes/skills.ts', 'src/routes/stats.ts',
  'src/routes/workspace.ts', 'src/routes/survey.ts', 'src/routes/knowledge.ts', 'server.ts']

const routes = new Set()
for (const f of ROUTE_FILES) {
  const s = readFileSync(f, 'utf8')
  for (const m of s.matchAll(/\/(?:api|ws)\/[a-zA-Z0-9_\/-]*(?:\$\{[^}]*\})?[a-zA-Z0-9_\/-]*/g)) {
    const u = m[0].replace(/\$\{[^}]*\}/g, '{x}').replace(/\/$/, '')
    if (u.startsWith('/api') || u.startsWith('/ws')) routes.add(u)
  }
}

const testFiles = []
const walk = (d) => { for (const f of readdirSync(d)) { const p = join(d, f); statSync(p).isDirectory() ? walk(p) : (f.endsWith('.test.ts') && testFiles.push(p)) } }
walk('test')
const testText = testFiles.map((f) => readFileSync(f, 'utf8')).join('\n')

const uncovered = []
for (const r of [...routes].sort()) {
  const key = r.replace('{x}', '')
  if (!testText.includes(key)) uncovered.push(r)
}
const pct = (routes.size - uncovered.length) / routes.size * 100
console.log(`route 测试引用覆盖: ${routes.size - uncovered.length}/${routes.size} (${pct.toFixed(1)}%)`)
console.log(`未引用（黄——新 route 必须补测试）: ${uncovered.length}`)
if (uncovered.length > 0) {
  console.log(uncovered.map((r) => `  - ${r}`).join('\n'))
}
// 新 route 哨兵（黄报——不阻断——exit 0；覆盖 <40% 才红——防线退化预警）
if (pct < 40) {
  console.error('覆盖 < 40%——route 测试面退化（红）')
  process.exit(1)
}
console.log('哨兵黄报完成（未引用清单见上——新 route 需带测试）')
