#!/usr/bin/env node
/**
 * L0 出口快照（W4 冻结——"L0 变更属显式事件"）
 *
 * 背景：L0 = 协议层（纯数据/不变量）——承诺"立即冻结"。机制化 =
 * 出口清单 golden：任何 L0 模块的**导出增删/改名/种类变化** → 快照红，
 * 必须显式 `node scripts/core-snapshot.mjs`（写入）+ commit 说明。
 *
 * 口径：**声明面**（每个 L0 文件的 export 声明——含再导出语句）。
 * 每个 L0 文件都在清单内 → 再导出目标内部的导出变化在其声明文件处可见，
 * 无需解析并集。不含签名细节（参数/类型结构变化由契约/fuzz/场景层覆盖）。
 * 零依赖（源码解析——剥注释；`export default` 无——实测 0）。
 *
 * 用法：
 *   node scripts/core-snapshot.mjs          # 写入快照（显式变更）
 *   node scripts/core-snapshot.mjs --check  # 校验（CI / audit:core-levels）
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SNAPSHOT = join(ROOT, 'scripts/core-l0-snapshot.json')

const levels = JSON.parse(readFileSync(join(ROOT, 'src/core/levels.json'), 'utf8'))
const l0Files = Object.entries(levels.files)
  .filter(([, v]) => v.level === 'l0')
  .map(([f]) => f)
  .sort()

const stripComments = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

/** 提取文件声明面：`name:kind` 集合（再导出 → `name:export`；`* → export-star`） */
function extractExports(src) {
  const clean = stripComments(src)
  const out = new Set()

  // 具名再导出 / 本地导出清单（跨行）：export [type] { a, b as c } [from '...']
  const NAMED = /export\s+(?:type\s+)?\{([^}]*)\}/g
  let m
  while ((m = NAMED.exec(clean))) {
    for (const raw of m[1].split(',')) {
      const part = raw.trim().replace(/^type\s+/, '')
      if (!part) continue
      const as = part.split(/\s+as\s+/)
      const name = (as[1] ?? as[0]).trim()
      if (/^[A-Za-z_$][\w$]*$/.test(name)) out.add(`${name}:export`)
    }
  }

  // 声明导出：export [async|abstract] kind Name
  const DECL = /^export\s+(?:async\s+|abstract\s+)?(function|class|const|let|var|interface|type|enum)\s+([A-Za-z_$][\w$]*)/gm
  while ((m = DECL.exec(clean))) out.add(`${m[2]}:${m[1]}`)

  // export * from / export * as ns from
  const STAR = /^export\s+\*\s*(?:as\s+([A-Za-z_$][\w$]*)\s+)?from\s+['"][^'"]+['"]/gm
  while ((m = STAR.exec(clean))) out.add(m[1] ? `${m[1]}:export` : '*:export-star')

  return [...out].sort()
}

const snapshot = { version: 1, files: {} }
for (const f of l0Files) snapshot.files[f] = extractExports(readFileSync(join(ROOT, f), 'utf8'))

const CHECK = process.argv.includes('--check')
const totalOf = (s) => Object.values(s.files).reduce((n, a) => n + a.length, 0)

if (!CHECK) {
  writeFileSync(SNAPSHOT, JSON.stringify(snapshot, null, 2) + '\n')
  console.log(`[core-snapshot] L0 ${l0Files.length} 文件 / ${totalOf(snapshot)} 声明——写入 ${relative(ROOT, SNAPSHOT)}`)
  process.exit(0)
}

const prev = existsSync(SNAPSHOT) ? JSON.parse(readFileSync(SNAPSHOT, 'utf8')) : null
const errs = []
if (!prev) {
  errs.push('快照缺失——先跑 node scripts/core-snapshot.mjs')
} else {
  const files = new Set([...Object.keys(prev.files), ...Object.keys(snapshot.files)])
  for (const f of [...files].sort()) {
    const oldL = new Set(prev.files[f] ?? [])
    const newL = new Set(snapshot.files[f] ?? [])
    const added = [...newL].filter((x) => !oldL.has(x))
    const removed = [...oldL].filter((x) => !newL.has(x))
    if (added.length) errs.push(`${f} 新增导出: ${added.join(', ')}`)
    if (removed.length) errs.push(`${f} 移除导出: ${removed.join(', ')}`)
  }
}
if (errs.length) {
  console.error('✖ L0 出口快照失败（L0 变更属显式事件——确认后 node scripts/core-snapshot.mjs 写入并 commit 说明）：')
  for (const e of errs.slice(0, 20)) console.error('  ' + e)
  process.exit(1)
}
console.log(`✔ L0 出口快照通过（${l0Files.length} 文件 / ${totalOf(snapshot)} 声明——冻结面无漂移）`)
