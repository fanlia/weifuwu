#!/usr/bin/env node
/**
 * weifuwu 分层清单生成器（level 分层重构 W0）
 *
 * 单一事实源：规则表（本文件）→ 生成 src/levels.json（逐文件 level/env）
 * + scripts/level-map-baseline.json（三层基线 + 泄漏/上行/三方清单）。
 *
 * 用法：
 *   node scripts/level-map.mjs           # 生成清单与基线（写入）
 *   node scripts/level-map.mjs --check   # 只读校验：新增未知/泄漏/上行/三方 = exit 1
 *
 * 分层判据（分类三问——详见 plan/level-分层重构.md）：
 *   L0 协议：没有运行时也存在？（纯数据/协议/不变量——零效果）
 *   L1 运行时：它执行某件事？（I/O/DOM/node）
 *   L2 生成：它生成什么？（声明 → 行为/机械部分）
 *   装备：以上都不满足。
 */
import { readFileSync, readdirSync, statSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, resolve, dirname, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const K = (p) => p.split(sep).join('/')

// ── 扫描范围（W3 目录迁移后：src/core 即全部内核——目录即层级） ──────
const SCOPE = ['src/core']

// ── 归属规则（路径前缀 → 层级/环境——目录即契约） ────────────────────
const RULES = [
  { match: 'src/core/l0/', level: 'l0', env: 'universal' },
  { match: 'src/core/l1/server/', level: 'l1', env: 'server' },
  { match: 'src/core/l1/client/', level: 'l1', env: 'client' },
  { match: 'src/core/l2/server/', level: 'l2', env: 'server' },
  { match: 'src/core/l2/client/', level: 'l2', env: 'client' },
]

const LEVELS = new Set(['l0', 'l1', 'l2'])
const isTest = (p) => /\.test\.tsx?$/.test(p)
const isSource = (p) => /\.tsx?$/.test(p) && !isTest(p)

/** 目标是否在 core（src/core 下）——不在即泄漏（装备面旧路径/shim/外部） */
const inScope = (rel) => rel.startsWith('src/core/')
function classify(rel) {
  for (const r of RULES) if (rel === r.match || rel.startsWith(r.match)) return { level: r.level, env: r.env }
  return null
}

function walk(target, out = []) {
  const st = statSync(target)
  if (st.isFile()) {
    const rel = K(relative(ROOT, target))
    if (isSource(rel)) out.push(rel)
    return out
  }
  for (const e of readdirSync(target)) {
    const abs = join(target, e)
    const s = statSync(abs)
    if (s.isDirectory()) walk(abs, out)
    else {
      const rel = K(relative(ROOT, abs))
      if (isSource(rel)) out.push(rel)
    }
  }
  return out
}

// ── import 提取（剥注释——防文档示例误报）────────────────────────────
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}
const IMPORT_RE = /(?:^|\n)\s*((?:import|export)\s+(?:type\s+)?[^;\n]*?from\s+['"]([^'"]+)['"])/g
function extractImports(src) {
  const clean = stripComments(src)
  const out = []
  let m
  while ((m = IMPORT_RE.exec(clean))) {
    const stmt = m[1]
    const spec = m[2]
    const typeOnly = /^\s*(import|export)\s+type\b/.test(stmt) || /\{\s*type\s/.test(stmt)
    out.push({ spec, typeOnly })
  }
  // 动态 import（值）
  const dyn = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g
  while ((m = dyn.exec(clean))) out.push({ spec: m[1], typeOnly: false })
  return out
}

function resolveRelative(fromRel, spec) {
  const base = resolve(ROOT, dirname(fromRel), spec)
  const cands = [base, base + '.ts', base + '.tsx', join(base, 'index.ts'), join(base, 'index.tsx')]
  for (const c of cands) {
    if (existsSync(c) && statSync(c).isFile()) return K(relative(ROOT, c))
  }
  return K(relative(ROOT, base))
}

// ── 主流程 ────────────────────────────────────────────────────────────
const files = [...new Set(SCOPE.flatMap((s) => walk(join(ROOT, s))))].sort()
const unknown = []
const manifest = {}
const thirdParty = []
const leaks = []
const upward = []
const nodeInUniversal = []
const summary = { l0: { files: 0, loc: 0, exports: 0 }, l1: { files: 0, loc: 0, exports: 0 }, l2: { files: 0, loc: 0, exports: 0 } }

for (const rel of files) {
  const cls = classify(rel)
  if (!cls) { unknown.push(rel); continue }
  const src = readFileSync(join(ROOT, rel), 'utf8')
  const loc = src.split('\n').length
  manifest[rel] = { level: cls.level, env: cls.env, loc }
  summary[cls.level].files++
  summary[cls.level].loc += loc
  summary[cls.level].exports += (src.match(/^\s*export\b/gm) ?? []).length

  const isCore = true
  for (const { spec, typeOnly } of extractImports(src)) {
    if (spec.startsWith('node:')) {
      if (isCore && cls.env === 'universal') nodeInUniversal.push(`${rel} → ${spec}`)
      continue
    }
    if (!spec.startsWith('.')) {
      if (isCore) thirdParty.push(`${rel} → ${spec}${typeOnly ? ' (type)' : ''}`)
      continue
    }
    const target = resolveRelative(rel, spec)
    if (!isSource(target) || !inScope(target)) {
      // 目标不在 core（旧路径 shim/装备/越界）——泄漏（core 闭包必须自足）
      if (isCore) leaks.push(`${rel} → ${target}${typeOnly ? ' (type)' : ''}`)
      continue
    }
    const tcls = classify(target)
    if (!tcls) { unknown.push(`${rel} → ${target}（目标未分类）`); continue }
    const rank = { l2: 2, l1: 1, l0: 0 }
    if (rank[tcls.level] > rank[cls.level]) upward.push(`${rel}(${cls.level}) → ${target}(${tcls.level})${typeOnly ? ' (type)' : ''}`)
  }
}

const uniq = (a) => [...new Set(a)].sort()
const artifact = {
  version: 1,
  scope: SCOPE,
  summary,
  files: manifest,
}
const baseline = {
  version: 1,
  summary,
  thirdParty: uniq(thirdParty),
  leaks: uniq(leaks),
  upward: uniq(upward),
  nodeInUniversal: uniq(nodeInUniversal),
  unknown: uniq(unknown),
}

const CHECK = process.argv.includes('--check')
const ARTIFACT = join(ROOT, 'src/levels.json')
const BASELINE = join(ROOT, 'scripts/level-map-baseline.json')
const DOCS = join(ROOT, 'docs/level.md')
const DOC_START = '<!-- level-inventory:start（由 npm run level:map 生成——勿手改） -->'
const DOC_END = '<!-- level-inventory:end -->'

function fmt(s) {
  const one = (x, n) => `${n} ${x.files} 文件/${x.loc} 行/${x.exports} 导出`
  return `${one(s.l0, 'L0')} · ${one(s.l1, 'L1')} · ${one(s.l2, 'L2')}`
}

/** docs/level.md 清单块（W4——生成面：levels.json 的文档投影） */
function renderInventory() {
  const lines = ['| 层 | 文件 | 行数 | 导出 |', '| --- | --- | --- | --- |']
  for (const [lv, name] of [['l0', 'L0'], ['l1', 'L1'], ['l2', 'L2']]) {
    const s = summary[lv]
    lines.push(`| ${name} | ${s.files} | ${s.loc} | ${s.exports} |`)
  }
  for (const [lv, name] of [['l0', 'L0'], ['l1', 'L1'], ['l2', 'L2']]) {
    const fs = Object.keys(manifest).filter((f) => manifest[f].level === lv).sort()
    lines.push('', `**${name}（${fs.length}）**`, '')
    for (const f of fs) lines.push(`- \`${f}\`（${manifest[f].env} · ${manifest[f].loc} 行）`)
  }
  return lines.join('\n')
}
function docsBlock() {
  return `${DOC_START}\n${renderInventory()}\n${DOC_END}`
}
/** 提取 docs 中已生成块（未见标记 → null） */
function currentDocsBlock() {
  if (!existsSync(DOCS)) return null
  const s = readFileSync(DOCS, 'utf8')
  const a = s.indexOf(DOC_START)
  const b = s.indexOf(DOC_END)
  if (a < 0 || b < 0) return null
  return s.slice(a, b + DOC_END.length)
}

if (CHECK) {
  const prev = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : null
  const errs = []
  if (unknown.length) errs.push(`未分类文件 ${unknown.length}`)
  for (const key of ['unknown', 'thirdParty', 'leaks', 'upward', 'nodeInUniversal']) {
    const now = key === 'unknown' ? uniq(unknown) : key === 'thirdParty' ? uniq(thirdParty) : baseline[key]
    const old = new Set(prev?.[key] ?? [])
    const added = now.filter((x) => !old.has(x))
    if (added.length) errs.push(`新增 ${key} ${added.length}:\n    ${added.slice(0, 10).join('\n    ')}`)
  }
  // 规模基线（W4——只降不升；扩面须显式 npm run level:map 更新基线，diff 可见）
  for (const lv of ['l0', 'l1', 'l2']) {
    for (const k of ['files', 'loc', 'exports']) {
      const nowV = summary[lv][k]
      const oldV = prev?.summary?.[lv]?.[k] ?? 0
      if (nowV > oldV) errs.push(`规模超基线 ${lv}.${k}: ${oldV} → ${nowV}（只降不升——显式更新基线）`)
    }
  }
  // docs 漂移哨兵（W4——生成块 == 文件内容）
  const cur = currentDocsBlock()
  if (cur === null) errs.push('docs/level.md 缺少 level-inventory 生成块标记（见脚本 DOC_START/DOC_END）')
  else if (cur !== docsBlock()) errs.push('docs/level.md 清单块漂移（跑 npm run level:map 重生成）')
  console.log(`[level-map] ${fmt(summary)}`)
  for (const k of ['thirdParty', 'leaks', 'upward', 'nodeInUniversal']) {
    if (baseline[k].length) console.log(`  存量 ${k}: ${baseline[k].length}（基线登记）`)
  }
  if (errs.length) {
    console.error(`✖ level-map 校验失败：\n  ${errs.join('\n  ')}`)
    process.exit(1)
  }
  console.log('✔ level-map 校验通过（无新增未知/三方/泄漏/上行 · 规模不升 · docs 无漂移）')
  process.exit(0)
}

writeFileSync(ARTIFACT, JSON.stringify(artifact, null, 2) + '\n')
writeFileSync(BASELINE, JSON.stringify(baseline, null, 2) + '\n')
if (existsSync(DOCS)) {
  const s = readFileSync(DOCS, 'utf8')
  const a = s.indexOf(DOC_START)
  const b = s.indexOf(DOC_END)
  if (a < 0 || b < 0) {
    console.error('✖ docs/level.md 缺少 level-inventory 标记——先补标记再生成')
    process.exit(1)
  }
  writeFileSync(DOCS, s.slice(0, a) + docsBlock() + s.slice(b + DOC_END.length))
}
console.log(`[level-map] ${fmt(summary)}`)
console.log(`写入 ${K(relative(ROOT, ARTIFACT))}（${files.length} 文件）`)
console.log(`写入 ${K(relative(ROOT, BASELINE))}`)
if (existsSync(DOCS)) console.log(`写入 ${K(relative(ROOT, DOCS))}（清单块）`)
console.log(`  未分类 ${unknown.length} · core 三方 ${thirdParty.length} · 泄漏 ${baseline.leaks.length} · 上行 ${baseline.upward.length} · universal 内 node: ${baseline.nodeInUniversal.length}`)
if (unknown.length) {
  console.error(`✖ 未分类文件（规则缺口——必须 0）：\n  ${unknown.join('\n  ')}`)
  process.exit(1)
}
if (thirdParty.length) console.log(`  三方登记（W2 目标 0）：\n    ${thirdParty.slice(0, 8).join('\n    ')}`)
if (baseline.leaks.length) console.log(`  泄漏登记（W2 目标 0——前 10）：\n    ${baseline.leaks.slice(0, 10).join('\n    ')}`)
