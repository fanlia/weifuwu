#!/usr/bin/env node
/**
 * weifuwu 分层清单生成器（level 分层重构 W0）
 *
 * 单一事实源：规则表（本文件）→ 生成
 *   src/levels.json                —— 全库逐文件 { kind, level, env, target, loc }
 *   scripts/level-map-baseline.json —— 各层规模 + 违规分类清单 + 闭包读数
 *   docs/level.md                  —— 清单块（生成面）
 *
 * 用法：
 *   node scripts/level-map.mjs            # 生成清单与基线（写入）
 *   node scripts/level-map.mjs --check    # 只读校验（新增未分类/违规/规模超基线/docs 漂移 = exit 1）
 *   node scripts/level-map.mjs --dry-run  # 只打印迁移预演统计（不写盘）
 *
 * 七级（目录即层级——W1 后）：
 *   0 协议/纯数据 · 1 通用运行时 · 2 服务端运行时 · 3 客户端运行时(DOM) ·
 *   4 生成器 · 5 装备 · 6 装配 + 应用
 *
 * 依赖规则：levelN → <N（同层互引允许）；特例 **L3 禁 L2**（客户端不得消费服务端）；
 * 环境：L0/L1/L4 禁 `node:` 与 DOM · L2 禁 DOM · L3 DOM 合法；三方依赖：L0–L4 = 0。
 *
 * 双模式：pre-move（`src/core` 存在——按迁移映射表分类，含 target 路径）/
 * post-move（`src/level0` 存在——src/levelN/** 直接分类）。W1 迁移后模式自动切换。
 */
import { readFileSync, readdirSync, statSync, writeFileSync, existsSync } from 'node:fs'
import { join, resolve, dirname, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const K = (p) => p.split(sep).join('/')

// ── 模式与扫描范围 ────────────────────────────────────────────────────
const MODE = existsSync(join(ROOT, 'src/level0')) && !existsSync(join(ROOT, 'src/core')) ? 'post' : 'pre'
const SCAN = ['src', 'apps']
const SKIP_DIRS = new Set(['node_modules', 'dist', 'test-results', 'backups', 'data', '.git', 'coverage'])

const isTest = (p) => /\.test\.tsx?$/.test(p)
const isSource = (p) => /\.tsx?$/.test(p) && !isTest(p) && !p.endsWith('.d.ts')
const isAsset = (p) => /\.(css|go|mjs)$/.test(p)
const isInScope = (p) => isSource(p) || isAsset(p) || isTest(p)

// ── 19 个公开入口（旧路径 → level6 目标）─────────────────────────────
const ENTRIES = new Map([
  ['src/server/index.ts', 'src/level6/index.ts'],
  ...[
    'ai', 'email', 'messager', 'postgres', 'queue', 'redis',
    'scheduler', 'ui', 'user', 'workflow', 'workflows',
  ].map((m) => [`src/server/${m}/index.ts`, `src/level6/server/${m}/index.ts`]),
  ['src/client/vdom/index.ts', 'src/level6/client/vdom/index.ts'],
  ['src/client/vdom/jsx-runtime.ts', 'src/level6/client/vdom/jsx-runtime.ts'],
  ['src/client/vdom/testing.ts', 'src/level6/client/vdom/testing.ts'],
  ['src/client/components/index.ts', 'src/level6/client/components/index.ts'],
  ['src/client/layout/index.ts', 'src/level6/client/layout/index.ts'],
  ['src/dev/index.ts', 'src/level6/dev/index.ts'],
  ['src/shared/router/index.ts', 'src/level6/shared/router/index.ts'],
])

// ── 闭包规则（DOM 种子 + 传递闭包——非清单硬编码）────────────────────
const DOM_RE = /\b(document|window|navigator|localStorage|sessionStorage|matchMedia|HTMLElement|MutationObserver|ResizeObserver|IntersectionObserver|requestAnimationFrame|getComputedStyle)\b/
const L1_CLIENT = 'src/core/l1/client/'

/** 剥注释（防文档/注释词面误判） */
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
    const typeOnly = /^\s*(import|export)\s+type\b/.test(stmt) || /\{\s*type\s/.test(stmt)
    out.push({ spec: m[2], typeOnly })
  }
  const dyn = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g
  while ((m = dyn.exec(clean))) out.push({ spec: m[1], typeOnly: false })
  return out
}

/** 相对 specifier → 仓库内文件（含 .ts/.tsx/index.{ts,tsx} 补全）；解析不到返回 null */
function resolveRelative(fromRel, spec) {
  const base = resolve(ROOT, dirname(join(ROOT, fromRel)), spec)
  const cands = [base, base + '.ts', base + '.tsx', join(base, 'index.ts'), join(base, 'index.tsx')]
  for (const c of cands) if (existsSync(c) && statSync(c).isFile()) return K(relative(ROOT, c))
  return null
}

// ── 扫描 ──────────────────────────────────────────────────────────────
function walk(target, out = []) {
  if (!existsSync(target)) return out
  const st = statSync(target)
  if (st.isFile()) {
    const rel = K(relative(ROOT, target))
    if (isInScope(rel)) out.push(rel)
    return out
  }
  for (const e of readdirSync(target)) {
    const abs = join(target, e)
    const s = statSync(abs)
    if (s.isDirectory()) {
      if (!SKIP_DIRS.has(e)) walk(abs, out)
    } else {
      const rel = K(relative(ROOT, abs))
      if (isInScope(rel)) out.push(rel)
    }
  }
  return out
}

const files = [...new Set(SCAN.flatMap((s) => walk(join(ROOT, s))))].sort()

// ── 纯再导出检测（barrel/shim——迁移时 shim 删除，barrel 保留为 entry）──
function pureReexports(rel) {
  if (!/\.tsx?$/.test(rel)) return null
  if (!existsSync(join(ROOT, rel))) return null
  const src = stripComments(readFileSync(join(ROOT, rel), 'utf8')).trim()
  if (!src) return null
  const stmts = src.split(/\n+(?=\s*(?:export|import))|;\s*/).map((s) => s.trim()).filter(Boolean)
  if (!stmts.length) return null
  const targets = []
  for (const s of stmts) {
    if (!/^(export\s+(\*|\{[^}]*\})\s+from\s+['"][^'"]+['"])$/.test(s)) return null
    const m = s.match(/from\s+['"]([^'"]+)['"]/)
    if (!m || !m[1].startsWith('.')) return null
    const t = resolveRelative(rel, m[1])
    if (!t) return null
    targets.push(t)
  }
  return targets
}

/** 旧路径 shim（再导出且目标在 core/level 内——迁移时删除） */
function isShim(rel) {
  const t = pureReexports(rel)
  return !!t && t.every((x) => x.startsWith('src/core/') || x.startsWith('src/level'))
}

// ── 闭包（DOM 种子 + 传递闭包——仅 pre-move 需要精确切分 L1/L3）────────
function computeClosure() {
  if (MODE === 'post') return null
  const l1 = files.filter((f) => f.startsWith(L1_CLIENT) && isSource(f))
  const set = new Set(l1)
  const importsOf = new Map()
  for (const f of l1) {
    const deps = new Set()
    for (const { spec } of extractImports(readFileSync(join(ROOT, f), 'utf8'))) {
      if (!spec.startsWith('.')) continue
      const base = resolve(ROOT, dirname(join(ROOT, f)), spec)
      const cands = [base + '.ts', base + '.tsx', join(base, 'index.ts'), join(base, 'index.tsx'), base]
      for (const c of cands) if (set.has(K(relative(ROOT, c)))) { deps.add(K(relative(ROOT, c))); break }
    }
    importsOf.set(f, [...deps])
  }
  const seed = l1.filter((f) => DOM_RE.test(stripComments(readFileSync(join(ROOT, f), 'utf8'))))
  const client = new Set(seed)
  let changed = true
  while (changed) {
    changed = false
    for (const [f, deps] of importsOf) if (!client.has(f) && deps.some((d) => client.has(d))) { client.add(f); changed = true }
  }
  return {
    rule: 'DOM-globals(11 词) code-face seed + import transitive closure',
    seedCount: seed.length,
    clientCount: client.size,
    universalCount: l1.length - client.size,
    client: [...client].map((p) => K(relative(ROOT, p))).sort(),
    universal: l1.filter((f) => !client.has(f)).map((p) => K(relative(ROOT, p))).sort(),
  }
}
const closure = computeClosure()
const CLIENT_SET = new Set(closure?.client ?? [])

// ── 分类（pre-move 规则表；post-move 目录规则）─────────────────────────
const NULL = { level: null, env: null, kind: 'unknown', target: null }

/** 纯路径判定（不读盘——测试/无基名文件也可用）：level/env */
function levelOfPath(rel) {
  if (rel.startsWith('src/test/')) return { kind: 'test-support', level: null, env: null }
  if (rel.startsWith('src/core/')) {
    const lvl = rel.startsWith('src/core/l0/') ? 0
      : rel.startsWith('src/core/l1/client/') ? (CLIENT_SET.has(rel) ? 3 : 1)
      : rel.startsWith('src/core/l1/server/') ? 2
      : rel.startsWith('src/core/l2/') ? 4 : null
    if (lvl === null) return null
    const env = lvl <= 1 || lvl === 4 ? 'universal' : lvl === 2 ? 'server' : 'client'
    return { kind: 'level', level: lvl, env }
  }
  if (ENTRIES.has(rel)) return { kind: 'level', level: 6, env: 'mixed' }
  if (rel.startsWith('src/')) return { kind: 'level', level: 5, env: 'mixed' }
  if (rel.startsWith('apps/')) return { kind: 'level', level: 6, env: 'mixed' }
  return null
}

function classify(rel) {
  if (isTest(rel)) {
    const base = rel.replace(/\.test\.tsx?$/, '.ts')
    const owner = levelOfPath(base) ?? levelOfPath(rel)
    if (!owner) return NULL
    return { ...owner, kind: 'test', target: null }
  }
  if (MODE === 'post') {
    const m = rel.match(/^src\/level([0-6])\//)
    if (m) {
      const level = Number(m[1])
      const env = level <= 1 || level === 4 ? 'universal' : level === 2 ? 'server' : level === 3 ? 'client' : 'mixed'
      const re = pureReexports(rel)
      const kind = isAsset(rel) ? 'asset' : re ? 'entry' : 'level'
      return { kind, level, env, target: rel }
    }
    return NULL
  }
  // pre-move：target = W1 后路径（规则投影）
  const target = (() => {
    if (ENTRIES.has(rel)) return ENTRIES.get(rel)
    if (rel.startsWith('src/core/l0/')) return 'src/level0/' + rel.slice('src/core/l0/'.length)
    if (rel.startsWith('src/core/l1/client/')) return (CLIENT_SET.has(rel) ? 'src/level3/' : 'src/level1/') + rel.slice(L1_CLIENT.length)
    if (rel.startsWith('src/core/l1/server/')) return 'src/level2/' + rel.slice('src/core/l1/server/'.length)
    if (rel.startsWith('src/core/l2/')) return 'src/level4/' + rel.slice('src/core/l2/'.length)
    if (rel.startsWith('src/')) return 'src/level5/' + rel.slice('src/'.length)
    if (rel.startsWith('apps/')) return 'src/level6/apps/' + rel.slice('apps/'.length)
    return null
  })()
  const base = levelOfPath(rel)
  if (!base) return NULL
  const kind = ENTRIES.has(rel) ? 'entry' : isShim(rel) ? 'shim' : isAsset(rel) ? 'asset' : base.kind
  return { kind, level: base.level, env: base.env, target: kind === 'shim' ? null : target }
}

// ── 主流程：第一遍分类（manifest/summary/shim），第二遍依赖检查 ──────
const manifest = {}
const unknown = []
const shims = {}
const violations = { thirdParty: [], upward: [], viaShim: [], nodeInUniversal: [], domInUniversal: [], domInServer: [], unresolved: [], shimBroken: [] }
const summary = {}
for (let l = 0; l <= 6; l++) summary[l] = { files: 0, loc: 0, exports: 0, assets: 0, tests: 0 }

// 第一遍：分类 + 清单 + 规模 + shim 登记
for (const rel of files) {
  const cls = classify(rel)
  if (cls === NULL || (cls.level === null && cls.kind === 'unknown')) { unknown.push(rel); continue }
  const src = readFileSync(join(ROOT, rel), 'utf8')
  const loc = src.split('\n').length
  manifest[rel] = { kind: cls.kind, level: cls.level, env: cls.env, target: cls.target, loc }
  if (cls.kind === 'shim') {
    const stmts = stripComments(src).trim().split(/\n+(?=\s*(?:export|import))|;\s*/).map((s) => s.trim()).filter(Boolean)
    const targets = stmts.map((s) => resolveRelative(rel, (s.match(/from\s+['"]([^'"]+)['"]/) ?? [])[1] ?? ''))
    if (targets.some((t) => !t)) violations.shimBroken.push(`${rel}（目标未解析）`)
    shims[rel] = { target: null, reexports: targets.filter(Boolean) }
    continue
  }
  if (cls.kind === 'test-support') continue
  if (cls.kind === 'test') {
    if (cls.level !== null) summary[cls.level].tests++
    continue
  }
  if (cls.kind === 'asset') {
    if (cls.level !== null) summary[cls.level].assets++
    continue
  }
  summary[cls.level].files++
  summary[cls.level].loc += loc
  summary[cls.level].exports += (src.match(/^\s*export\b/gm) ?? []).length
}

// entry 有效层级（barrel 方向检查用其再导出目标的最大层级——再导出面不引入实现层）
for (const [rel, info] of Object.entries(manifest)) {
  if (info.kind !== 'entry') continue
  const lvls = []
  for (const { spec } of extractImports(readFileSync(join(ROOT, rel), 'utf8'))) {
    if (!spec.startsWith('.')) continue
    const t = resolveRelative(rel, spec)
    const m = t ? manifest[t] : null
    if (m && m.kind === 'level' && typeof m.level === 'number') lvls.push(m.level)
  }
  info.effectiveLevel = lvls.length ? Math.max(...lvls) : info.level
}

// 第二遍：依赖检查（kind 'level' 源文件）
const ALLOWED = { 0: [0], 1: [0, 1], 2: [0, 1, 2], 3: [0, 1, 3], 4: [0, 1, 2, 3, 4], 5: [0, 1, 2, 3, 4, 5], 6: [0, 1, 2, 3, 4, 5, 6] }
for (const [rel, info] of Object.entries(manifest)) {
  if (info.kind !== 'level') continue
  const src = readFileSync(join(ROOT, rel), 'utf8')
  for (const { spec, typeOnly } of extractImports(src)) {
    if (spec.startsWith('node:')) {
      if (info.env === 'universal') violations.nodeInUniversal.push(`${rel} → ${spec}`)
      continue
    }
    if (!spec.startsWith('.')) {
      if (info.level <= 4) violations.thirdParty.push(`${rel} → ${spec}${typeOnly ? ' (type)' : ''}`)
      continue
    }
    const target = resolveRelative(rel, spec)
    if (!target) { violations.unresolved.push(`${rel} → ${spec}`); continue }
    const t = manifest[target] ?? classify(target)
    if (t.kind === 'shim') { violations.viaShim.push(`${rel} → ${target}${typeOnly ? ' (type)' : ''}`); continue }
    if (t.level === null || t.kind === 'test' || t.kind === 'test-support' || t.kind === 'asset') continue
    const targetLevel = t.kind === 'entry' ? (t.effectiveLevel ?? t.level) : t.level
    if (!ALLOWED[info.level].includes(targetLevel)) {
      violations.upward.push(`${rel}(L${info.level}) → ${target}(L${targetLevel}${t.kind === 'entry' ? ' entry' : ''})${typeOnly ? ' (type)' : ''}`)
    }
  }
  if (DOM_RE.test(stripComments(src))) {
    if (info.env === 'universal') violations.domInUniversal.push(rel)
    else if (info.level === 2) violations.domInServer.push(rel)
  }
}

const uniq = (a) => [...new Set(a)].sort()
const violationsU = Object.fromEntries(Object.entries(violations).map(([k, v]) => [k, uniq(v)]))
const artifact = {
  version: 2,
  mode: MODE,
  rules: { levels: 7, dependency: 'levelN → <N（同层允许）· L3 禁 L2', env: 'L0/L1/L4 禁 node:+DOM · L2 禁 DOM' },
  closure: closure ? { rule: closure.rule, seedCount: closure.seedCount, clientCount: closure.clientCount, universalCount: closure.universalCount, universal: closure.universal } : null,
  summary,
  shims,
  files: manifest,
}
const baseline = {
  version: 2,
  mode: MODE,
  summary,
  closure: closure ? { seedCount: closure.seedCount, clientCount: closure.clientCount, universalCount: closure.universalCount } : null,
  unknown: uniq(unknown),
  violations: violationsU,
}

// ── 文档块 ────────────────────────────────────────────────────────────
const ARTIFACT = join(ROOT, 'src/levels.json')
const BASELINE = join(ROOT, 'scripts/level-map-baseline.json')
const DOCS = join(ROOT, 'docs/level.md')
const DOC_START = '<!-- level-inventory:start（由 npm run level:map 生成——勿手改） -->'
const DOC_END = '<!-- level-inventory:end -->'
const NAMES = { 0: 'L0 协议/纯数据', 1: 'L1 通用运行时', 2: 'L2 服务端运行时', 3: 'L3 客户端运行时', 4: 'L4 生成器', 5: 'L5 装备', 6: 'L6 装配+应用' }

function renderInventory() {
  const lines = ['| 层 | 源码 | 行数 | 导出 | 资产 | 测试 |', '| --- | --- | --- | --- | --- | --- |']
  for (let l = 0; l <= 6; l++) {
    const s = summary[l]
    lines.push(`| ${NAMES[l]} | ${s.files} | ${s.loc} | ${s.exports} | ${s.assets} | ${s.tests} |`)
  }
  lines.push('', `闭包读数：种子 ${closure?.seedCount ?? '-'} · 客户端 ${closure?.clientCount ?? '-'} · 通用 ${closure?.universalCount ?? '-'}（规则入库——剥注释口径）`)
  lines.push('', `shim 位点 ${Object.keys(shims).length}（迁移时删除——不再生成）· 清单全量见 \`src/levels.json\``)
  return lines.join('\n')
}
const docsBlock = () => `${DOC_START}\n${renderInventory()}\n${DOC_END}`
function currentDocsBlock() {
  if (!existsSync(DOCS)) return null
  const s = readFileSync(DOCS, 'utf8')
  const a = s.indexOf(DOC_START)
  const b = s.indexOf(DOC_END)
  return a < 0 || b < 0 ? null : s.slice(a, b + DOC_END.length)
}

// ── 输出 ──────────────────────────────────────────────────────────────
const CHECK = process.argv.includes('--check')
const DRY = process.argv.includes('--dry-run')
const fmt = (s) => Object.keys(s).map((l) => `L${l} ${s[l].files}文件/${s[l].loc}行`).join(' · ')

if (DRY) {
  const byTarget = {}
  for (const rel of files) {
    const t = manifest[rel]?.target
    if (!t) continue
    const key = t.replace(/\/[^/]+$/, '')
    byTarget[key] = (byTarget[key] ?? 0) + 1
  }
  console.log(`[level-map --dry-run] 模式=${MODE} 文件=${files.length} shim=${Object.keys(shims).length} 未分类=${unknown.length}`)
  console.log(fmt(summary))
  console.log('目标目录（前 25）：')
  for (const [k, v] of Object.entries(byTarget).sort((a, b) => b[1] - a[1]).slice(0, 25)) console.log(`  ${String(v).padStart(4)} ${k}`)
  process.exit(unknown.length ? 1 : 0)
}

if (CHECK) {
  const prev = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : null
  const errs = []
  const added = (arr, old) => arr.filter((x) => !new Set(old ?? []).has(x))
  for (const key of Object.keys(violationsU)) {
    const a = added(violationsU[key], prev?.violations?.[key])
    if (a.length) errs.push(`新增 ${key} ${a.length}:\n    ${a.slice(0, 8).join('\n    ')}`)
  }
  if (unknown.length) errs.push(`未分类文件 ${unknown.length}:\n    ${unknown.slice(0, 8).join('\n    ')}`)
  for (let l = 0; l <= 4; l++) {
    for (const k of ['files', 'loc', 'exports']) {
      const nowV = summary[l][k]
      const oldV = prev?.summary?.[l]?.[k] ?? 0
      if (nowV > oldV) errs.push(`规模超基线 L${l}.${k}: ${oldV} → ${nowV}（只降不升——显式 npm run level:map 更新）`)
    }
  }
  if (closure && prev?.closure && (closure.clientCount !== prev.closure.clientCount || closure.universalCount !== prev.closure.universalCount)) {
    errs.push(`闭包切分漂移：client ${prev.closure.clientCount}→${closure.clientCount} · universal ${prev.closure.universalCount}→${closure.universalCount}（L1/L3 边界变更属显式事件）`)
  }
  const cur = currentDocsBlock()
  if (cur === null) errs.push('docs/level.md 缺少 level-inventory 生成块标记')
  else if (cur !== docsBlock()) errs.push('docs/level.md 清单块漂移（跑 npm run level:map 重生成）')
  console.log(`[level-map] 模式=${MODE} ${fmt(summary)}`)
  if (errs.length) {
    console.error(`✖ level-map 校验失败：\n  ${errs.join('\n  ')}`)
    process.exit(1)
  }
  console.log('✔ level-map 校验通过（无新增未分类/违规 · 规模不升 · 闭包不漂移 · docs 无漂移）')
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
console.log(`[level-map] 模式=${MODE} ${fmt(summary)}`)
console.log(`写入 ${K(relative(ROOT, ARTIFACT))}（${files.length} 文件 · shim ${Object.keys(shims).length}）`)
console.log(`写入 ${K(relative(ROOT, BASELINE))}`)
if (existsSync(DOCS)) console.log(`写入 ${K(relative(ROOT, DOCS))}（清单块）`)
console.log(`  未分类 ${unknown.length} · 三方 ${violationsU.thirdParty.length} · 上行 ${violationsU.upward.length} · 经 shim ${violationsU.viaShim.length} · universal 内 node: ${violationsU.nodeInUniversal.length} / DOM ${violationsU.domInUniversal.length} · server 内 DOM ${violationsU.domInServer.length} · 未解析 ${violationsU.unresolved.length} · shim 破损 ${violationsU.shimBroken.length}`)
if (unknown.length) {
  console.error(`✖ 未分类文件（规则缺口——必须 0）：\n  ${unknown.join('\n  ')}`)
  process.exit(1)
}
const hasViol = Object.values(violationsU).some((v) => v.length)
if (hasViol) {
  console.log('  违规登记（新增 = 红；存量见 baseline）：')
  for (const [k, v] of Object.entries(violationsU)) if (v.length) console.log(`    ${k} ${v.length}: ${v.slice(0, 4).join(' · ')}${v.length > 4 ? ' …' : ''}`)
}
