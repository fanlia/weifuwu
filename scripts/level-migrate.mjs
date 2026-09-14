#!/usr/bin/env node
/**
 * W1 迁移执行器（W0 交付——**dry-run 默认**，--apply 才落盘）
 *
 * 输入：src/levels.json（pre-move 模式——逐文件 { kind, target } 规则投影）
 *
 * 步骤：
 *   ① 搬迁表：kind level/asset/test/entry → old→target；kind shim → 删除
 *   ② 重写表：解析式 import 重写——相对 specifier 解析到旧路径 → 查搬迁表 →
 *      由**新文件位置**计算新相对 specifier（保留扩展名风格；裸 `weifuwu/...`
 *      经 package exports → 源路径 → 搬迁表）
 *   ③ dry-run：报告搬迁/重写/未解析（必须 0）与样例；--apply 执行
 *
 * 约束：未解析 > 0 拒绝 --apply（重写不完整 = 编译断链）。
 * 用法：
 *   node scripts/level-migrate.mjs            # dry-run
 *   node scripts/level-migrate.mjs --apply    # 执行（git mv + 内容重写 + shim 删除）
 */
import { readFileSync, writeFileSync, existsSync, statSync, mkdirSync } from 'node:fs'
import { join, dirname, resolve, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const K = (p) => p.split(sep).join('/')
const APPLY = process.argv.includes('--apply')

const manifest = JSON.parse(readFileSync(join(ROOT, 'src/levels.json'), 'utf8'))
if (manifest.mode !== 'pre') {
  console.error('✖ level-migrate 需要 pre-move 清单（src/levels.json.mode==="pre"）——W1 已执行？')
  process.exit(1)
}

// ── 搬迁表 ────────────────────────────────────────────────────────────
const moves = new Map() // old → new
const deletes = [] // shim 位点
const rewriteFiles = [] // 需要重写内容的文件（旧路径）
for (const [rel, info] of Object.entries(manifest.files)) {
  if (info.kind === 'shim') { deletes.push(rel); continue }
  if (info.target) moves.set(rel, info.target)
  if (/\.tsx?$/.test(rel)) rewriteFiles.push(rel)
}
const targetOf = (rel) => moves.get(rel) ?? rel

/** 单目标 shim → 真实目标（消费侧重写穿透——shim 本体将删除） */
const shimTargets = new Map()
for (const [rel, info] of Object.entries(manifest.shims ?? {})) {
  const t = (info.reexports ?? []).filter(Boolean)
  if (t.length === 1) shimTargets.set(rel, t[0])
}

/** 旧路径解析：相对 specifier → 仓库文件（含 .ts/.tsx/index + 原样扩展） */
function resolveOld(fromRel, spec) {
  const base = resolve(ROOT, dirname(join(ROOT, fromRel)), spec)
  const cands = [base, base + '.ts', base + '.tsx', join(base, 'index.ts'), join(base, 'index.tsx')]
  for (const c of cands) if (existsSync(c) && statSync(c).isFile()) return K(relative(ROOT, c))
  return null
}

/** 旧 package exports → 源文件（dist 路径反推：strip dist/ + .js→.ts/.tsx/.css） */
function exportsToSource(path) {
  let p = path.replace(/^\.\//, '')
  if (!p.startsWith('dist/')) return null
  p = 'src/' + p.slice('dist/'.length)
  const cands = [p, p.replace(/\.js$/, '.ts'), p.replace(/\.js$/, '.tsx'), join(p.replace(/\.js$/, ''), 'index.ts'), join(p.replace(/\.js$/, ''), 'index.tsx')]
  for (const c of cands) if (existsSync(join(ROOT, c)) && statSync(join(ROOT, c)).isFile()) return c
  return null
}
const EXPORTS = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).exports ?? {}
const pkgSources = new Map()
for (const [key, val] of Object.entries(EXPORTS)) {
  const p = typeof val === 'string' ? val : val?.import ?? val?.default ?? val?.types
  if (typeof p !== 'string') continue
  const src = exportsToSource(p)
  if (src) pkgSources.set(key === '.' ? 'weifuwu' : 'weifuwu/' + key.replace(/^\.\//, ''), src)
}

// ── specifier 重写 ────────────────────────────────────────────────────
const SPEC_RE = /(\bfrom\s*|\bimport\s*\(\s*|(?:^|\n)\s*import\s+)(['"])([^'"]+)\2/g
// 良性未解析登记（字符串内路径 / 运行时临时文件 / 既有 type-only 陈留——运行时不解析）
const BENIGN = new Map([
  ['apps/agent-platform/test/kb-search.test.ts → ../services/kb-search.ts', '断言字符串（生成代码内容）'],
  ['apps/agent-platform/test/kb-search.test.ts → ../../../src/services/kb-search.ts', '断言字符串（生成代码内容）'],
  ['apps/agent-platform/test/skills.test.ts → ../../../src/ai/types.ts', '生成代码模板字符串（临时目录语义）'],
  ['src/server/ui/ui.test.ts → ./dep', '运行时临时文件（测试写入后编译）'],
  ['src/test/contract/memo.test.ts → ../../client/vdom/core/command/types.ts', '既有 type-only 陈留（运行时擦除——非搬迁引入）'],
  ['src/test/scenario/registry.ts → ../../vdom/hooks/popup-manager.ts', '既有 type-only 陈留（运行时擦除——非搬迁引入）'],
])
const stats = { scanned: 0, rewritten: 0, unresolved: [], benign: 0, pkgRewrites: 0, cssRewrites: 0 }
const samples = []

function rewriteSpec(rel, spec) {
  const importerNew = targetOf(rel)
  const newRelSpec = (newTarget) => {
    let relPath = K(relative(dirname(join(ROOT, importerNew)), join(ROOT, newTarget)))
    if (!relPath.startsWith('.')) relPath = './' + relPath
    return relPath
  }
  if (spec.startsWith('.')) {
    let oldTarget = resolveOld(rel, spec)
    if (!oldTarget) {
      if (BENIGN.has(`${rel} → ${spec}`)) { stats.benign++; return spec }
      stats.unresolved.push(`${rel} → ${spec}`)
      return spec
    }
    if (manifest.files[oldTarget]?.kind === 'shim') {
      const real = shimTargets.get(oldTarget)
      if (!real) { stats.unresolved.push(`${rel} → ${spec}（多目标 shim——需手工）`); return spec }
      oldTarget = real
    }
    const newTarget = targetOf(oldTarget)
    if (/['"]/.test(newTarget)) { stats.unresolved.push(`${rel} → ${spec}（目标未搬迁）`); return spec }
    if (/\.css$/.test(spec)) stats.cssRewrites++
    return newRelSpec(newTarget)
  }
  if (spec === 'weifuwu' || spec.startsWith('weifuwu/')) {
    const src = pkgSources.get(spec)
    if (!src) { stats.unresolved.push(`${rel} → ${spec}（exports 无映射）`); return spec }
    stats.pkgRewrites++
    return newRelSpec(targetOf(src))
  }
  return spec
}

const outputs = new Map() // rel → rewritten text
for (const rel of rewriteFiles) {
  stats.scanned++
  const text = readFileSync(join(ROOT, rel), 'utf8')
  let count = 0
  const out = text.replace(SPEC_RE, (m, prefix, q, spec) => {
    const next = rewriteSpec(rel, spec)
    if (next !== spec) { count++; if (samples.length < 8 && next.includes('level')) samples.push(`${rel}\n    ${spec} → ${next}`) }
    return prefix + q + next + q
  })
  if (count) stats.rewritten += count
  outputs.set(rel, out)
}

// ── 报告 ──────────────────────────────────────────────────────────────
console.log(`[level-migrate] ${APPLY ? 'APPLY' : 'dry-run'} · scoreboard`)
console.log(`  搬迁 ${moves.size} 文件 · shim 删除 ${deletes.length} · 重写扫描 ${stats.scanned} 文件 / ${stats.rewritten} specifier`)
console.log(`  其中裸包 specifier（weifuwu*）${stats.pkgRewrites} · css ${stats.cssRewrites} · **未解析 ${stats.unresolved.length}** · 良性登记 ${stats.benign}`)
if (samples.length) {
  console.log('  样例：')
  for (const s of samples) console.log('    ' + s)
}
if (stats.unresolved.length) {
  console.error(`✖ 未解析 specifier（重写不完整——不得 --apply）：`)
  for (const u of stats.unresolved.slice(0, 20)) console.error('    ' + u)
  process.exit(1)
}
if (!APPLY) {
  console.log('✔ dry-run 通过（未解析 0）——确认后 `node scripts/level-migrate.mjs --apply`')
  process.exit(0)
}

// ── 执行：先写内容（旧盘），再 git mv，再 shim 删除 ─────────────────────
// ① 未搬迁文件（src/test/** 等）就地写回
for (const [rel, out] of outputs) if (!moves.has(rel)) writeFileSync(join(ROOT, rel), out)
// ② git mv（目录自动创建）+ 搬迁文件写回新位置
for (const [oldRel, newRel] of moves) {
  const absNew = join(ROOT, newRel)
  mkdirSync(dirname(absNew), { recursive: true })
  execFileSync('git', ['mv', oldRel, newRel], { cwd: ROOT, stdio: 'pipe' })
  if (outputs.has(oldRel)) writeFileSync(absNew, outputs.get(oldRel))
}
// ③ shim 删除
for (const rel of deletes) execFileSync('git', ['rm', '-q', rel], { cwd: ROOT, stdio: 'pipe' })

console.log(`✔ apply 完成：搬迁 ${moves.size} · 重写 ${stats.rewritten} specifier · 删除 shim ${deletes.length}`)
console.log('  下一步：node scripts/level-map.mjs（post-move 模式重新生成清单与基线）→ 全量回归')
