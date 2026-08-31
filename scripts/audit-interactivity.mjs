#!/usr/bin/env node
/**
 * 交互完整性静态审计（CLIENT-INTERACTIVITY-PLAN 波次 1——2027-09）
 *
 * 三检查（ImageCropper 死交互实证驱动——301 测试全绿但拖拽主路径未接线）：
 *   1. 死变量：let x 声明后全文引用仅 1 次（B 类红线——exit 1）
 *   2. 死函数：const fn = (...) => 引用仅 1 次（B 类红线——exit 1）
 *   3. 注释-实现对账：注释声称 use[A-Z]\w+ 但代码零使用（A 类 warn——文档腐化）
 *
 * 豁免：代码行内 `// audit-exempt: 理由`（零静默豁免——理由必须写）。
 * 用法：node scripts/audit-interactivity.mjs
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = 'src/client/components'
const findings = []
let total = 0

for (const dir of readdirSync(ROOT)) {
  const stat = statSync(join(ROOT, dir))
  if (!stat.isDirectory()) continue
  const files = readdirSync(join(ROOT, dir)).filter((f) => f.endsWith('.ts') && !f.includes('.test.'))
  const src = files.map((f) => readFileSync(join(ROOT, dir, f), 'utf8')).join('\n')
  const issues = { fatal: [], warn: [] }
  const lines = src.split('\n')
  const isComment = (l) => { const t = l.trim(); return t.startsWith('*') || t.startsWith('//') || t.startsWith('/*') }
  const exempt = (lineIdx) => lines.slice(Math.max(0, lineIdx - 1), lineIdx + 2).some((l) => l.includes('audit-exempt'))

  // 1. 死变量（B 类）
  for (const m of src.matchAll(/let (\w+)(?::[^=;]+)?\s*=/g)) {
    const name = m[1]
    const count = [...src.matchAll(new RegExp(`\\b${name}\\b`, 'g'))].length
    const lineIdx = src.slice(0, m.index).split('\n').length - 1
    if (count === 1 && !exempt(lineIdx)) issues.fatal.push(`死变量 let ${name}（:${lineIdx + 1}）`)
  }
  // 2. 死函数（B 类）——排除常见误报（h/draw 等在别处调用的短名由计数保证）
  for (const m of src.matchAll(/const (\w+) = \(([^)]*)\)\s*(?::[^=]*)?=>/g)) {
    const name = m[1]
    const count = [...src.matchAll(new RegExp(`\\b${name}\\b`, 'g'))].length
    const lineIdx = src.slice(0, m.index).split('\n').length - 1
    if (count === 1 && !exempt(lineIdx)) issues.fatal.push(`疑似死函数 ${name}()（:${lineIdx + 1}）`)
  }
  // 3. 注释声称 hook 但代码零使用（A 类）
  const claimedHooks = [...src.matchAll(/use[A-Z]\w+/g)].map((x) => x[0])
  for (const hk of new Set(claimedHooks)) {
    const codeUses = lines.filter((l) => !isComment(l) && l.includes(hk)).length
    if (codeUses === 0) issues.warn.push(`注释声称 ${hk} 但代码零使用（文档腐化）`)
  }
  total++
  if (issues.fatal.length || issues.warn.length) findings.push({ comp: dir, ...issues })
}

console.log(`审计 ${total} 组件目录`)
for (const f of findings) {
  for (const i of f.fatal) console.log(`  ✖【${f.comp}】${i}`)
  for (const i of f.warn) console.log(`  ⚠️【${f.comp}】${i}`)
}
const fatalCount = findings.reduce((n, f) => n + f.fatal.length, 0)
const warnCount = findings.reduce((n, f) => n + f.warn.length, 0)
console.log(`\nB 类（死代码）: ${fatalCount}  |  A 类（文档腐化）: ${warnCount}`)
if (fatalCount > 0) {
  console.log('✖ B 类红线：死代码 = 写了一半没接完的交互——修复或删除（audit-exempt 登记豁免）')
  process.exit(1)
}
console.log('✔ B 类清零（A 类 warn 档——波次 4 清理后归零）')
