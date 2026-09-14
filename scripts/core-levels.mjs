#!/usr/bin/env node
/**
 * weifuwu/core 分层清单生成器（W0——core-分层与冻结计划）
 *
 * 单一事实源：规则表（本文件）→ 生成 src/core/levels.json（逐文件 level/env）
 * + scripts/core-levels-baseline.json（三层基线 + 泄漏/上行/三方清单）。
 *
 * 用法：
 *   node scripts/core-levels.mjs           # 生成清单与基线（写入）
 *   node scripts/core-levels.mjs --check   # 只读校验：新增未知/泄漏/上行/三方 = exit 1
 *
 * 分层判据（分类三问——详见 plan/core-分层与冻结.md）：
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

// ── 扫描范围（范围内每个非测试文件必须有明确归属——未知即错）────────────
const SCOPE = [
  'src/shared',
  'src/client/vdom/core',
  'src/client/vdom/context',
  'src/client/vdom/browser',
  'src/client/vdom/dev',
  'src/client/vdom/store.ts',
  'src/client/vdom/observable',
  'src/client/vdom/hooks',
  'src/client/layout/define.ts',
  'src/client/layout/decl.ts',
  'src/server/core',
  'src/server/db',
  'src/server/types.ts',
  'src/server/response.ts',
]

// ── 装备豁免（范围内但不入 core 的显式登记）────────────────────────────
const EQUIPMENT_EXCEPTIONS = [
  'src/client/vdom/index.ts',
  'src/client/vdom/jsx-runtime.ts',
  'src/client/vdom/testing.ts',
  'src/client/vdom/middlewares/',
  'src/server/db/postgres/',
  'src/server/db/redis/',
  'src/server/db/memory-redis.ts',
  'src/server/db/redis-server.ts',
  'src/server/db/gql-from-shape.ts',
  'src/server/db/rest-from-shape.ts',
  'src/server/db/server.ts',
]

// ── 归属规则（首匹配优先——path 前缀或精确文件）────────────────────────
const RULES = [
  // L0 协议（universal——纯数据/协议/不变量）
  { match: 'src/shared/router/', level: 'l0', env: 'universal' },
  { match: 'src/shared/zod.ts', level: 'l0', env: 'universal' },
  { match: 'src/server/types.ts', level: 'l0', env: 'universal' },
  { match: 'src/server/db/shape.ts', level: 'l0', env: 'universal' },
  { match: 'src/server/db/ops.ts', level: 'l0', env: 'universal' },
  { match: 'src/server/db/query.ts', level: 'l0', env: 'universal' },
  { match: 'src/server/db/contracts.ts', level: 'l0', env: 'universal' },
  { match: 'src/server/db/errors.ts', level: 'l0', env: 'universal' },
  { match: 'src/server/db/filter.ts', level: 'l0', env: 'universal' },
  { match: 'src/client/vdom/core/vnode.ts', level: 'l0', env: 'universal' },
  { match: 'src/client/vdom/core/command/', level: 'l0', env: 'universal' },
  { match: 'src/client/vdom/core/node/hole.ts', level: 'l0', env: 'universal' },
  { match: 'src/client/vdom/core/field/key.ts', level: 'l0', env: 'universal' },

  // L2 生成（声明 → 行为/机械部分——迁移期 provisional）
  { match: 'src/client/vdom/core/create-component.ts', level: 'l2', env: 'client' },
  { match: 'src/client/vdom/core/create-item.ts', level: 'l2', env: 'client' },
  { match: 'src/client/vdom/core/semantic.ts', level: 'l2', env: 'client' },
  { match: 'src/client/vdom/hooks/', level: 'l1', env: 'client' },
  { match: 'src/client/layout/define.ts', level: 'l2', env: 'client' },
  { match: 'src/client/layout/decl.ts', level: 'l2', env: 'client' },
  { match: 'src/server/db/body.ts', level: 'l2', env: 'server' },
  { match: 'src/server/db/http.ts', level: 'l2', env: 'server' },

  // L1 运行时（引擎——产生效果）
  { match: 'src/client/vdom/core/', level: 'l1', env: 'client' },
  { match: 'src/client/vdom/context/', level: 'l1', env: 'client' },
  { match: 'src/client/vdom/browser/', level: 'l1', env: 'client' },
  { match: 'src/client/vdom/dev/', level: 'l1', env: 'client' },
  { match: 'src/client/vdom/store.ts', level: 'l1', env: 'universal' },
  { match: 'src/client/vdom/observable/', level: 'l1', env: 'universal' },
  { match: 'src/server/core/', level: 'l1', env: 'server' },
  { match: 'src/server/response.ts', level: 'l1', env: 'server' },
  { match: 'src/server/db/orm.ts', level: 'l1', env: 'server' },
  { match: 'src/server/db/query-builder.ts', level: 'l1', env: 'server' },
  { match: 'src/server/db/typed-query.ts', level: 'l1', env: 'server' },
  { match: 'src/server/db/schema.ts', level: 'l1', env: 'server' },
  { match: 'src/server/db/consistency.ts', level: 'l1', env: 'server' },
  { match: 'src/server/db/memory-sql.ts', level: 'l1', env: 'server' },
]

const LEVELS = new Set(['l0', 'l1', 'l2', 'equipment'])
const isTest = (p) => /\.test\.tsx?$/.test(p)
const isSource = (p) => /\.tsx?$/.test(p) && !isTest(p)

function inScope(rel) {
  return SCOPE.some((s) => rel === s || rel.startsWith(s.endsWith('/') ? s : s + '/'))
}
function isException(rel) {
  return EQUIPMENT_EXCEPTIONS.some((s) => rel === s || (s.endsWith('/') ? rel.startsWith(s) : false))
}
function classify(rel) {
  for (const r of RULES) if (rel === r.match || rel.startsWith(r.match)) return { level: r.level, env: r.env }
  if (isException(rel)) return { level: 'equipment', env: 'n/a' }
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
const summary = { l0: { files: 0, loc: 0, exports: 0 }, l1: { files: 0, loc: 0, exports: 0 }, l2: { files: 0, loc: 0, exports: 0 }, equipment: { files: 0, loc: 0, exports: 0 } }

for (const rel of files) {
  const cls = classify(rel)
  if (!cls) { unknown.push(rel); continue }
  const src = readFileSync(join(ROOT, rel), 'utf8')
  const loc = src.split('\n').length
  manifest[rel] = { level: cls.level, env: cls.env, loc }
  summary[cls.level].files++
  summary[cls.level].loc += loc
  summary[cls.level].exports += (src.match(/^\s*export\b/gm) ?? []).length

  const isCore = cls.level !== 'equipment'
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
      // 目标不在范围内 = 装备（且不在 scope 里）
      if (isCore) leaks.push(`${rel} → ${target}${typeOnly ? ' (type)' : ''}`)
      continue
    }
    const tcls = classify(target)
    if (!tcls) { unknown.push(`${rel} → ${target}（目标未分类）`); continue }
    if (!isCore) continue
    if (tcls.level === 'equipment') leaks.push(`${rel} → ${target}${typeOnly ? ' (type)' : ''}`)
    else if (tcls.level !== cls.level) {
      const rank = { l2: 2, l1: 1, l0: 0 }
      if (rank[tcls.level] > rank[cls.level]) upward.push(`${rel}(${cls.level}) → ${target}(${tcls.level})${typeOnly ? ' (type)' : ''}`)
    }
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
const ARTIFACT = join(ROOT, 'src/core/levels.json')
const BASELINE = join(ROOT, 'scripts/core-levels-baseline.json')

function fmt(s) {
  const one = (x, n) => `${n} ${x.files} 文件/${x.loc} 行/${x.exports} 导出`
  return `${one(s.l0, 'L0')} · ${one(s.l1, 'L1')} · ${one(s.l2, 'L2')} · ${one(s.equipment, '装备')}`
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
  console.log(`[core-levels] ${fmt(summary)}`)
  for (const k of ['thirdParty', 'leaks', 'upward', 'nodeInUniversal']) {
    if (baseline[k].length) console.log(`  存量 ${k}: ${baseline[k].length}（基线登记）`)
  }
  if (errs.length) {
    console.error(`✖ core-levels 校验失败：\n  ${errs.join('\n  ')}`)
    process.exit(1)
  }
  console.log('✔ core-levels 校验通过（无新增未知/三方/泄漏/上行）')
  process.exit(0)
}

mkdirSync(join(ROOT, 'src/core'), { recursive: true })
writeFileSync(ARTIFACT, JSON.stringify(artifact, null, 2) + '\n')
writeFileSync(BASELINE, JSON.stringify(baseline, null, 2) + '\n')
console.log(`[core-levels] ${fmt(summary)}`)
console.log(`写入 ${K(relative(ROOT, ARTIFACT))}（${files.length} 文件）`)
console.log(`写入 ${K(relative(ROOT, BASELINE))}`)
console.log(`  未分类 ${unknown.length} · core 三方 ${thirdParty.length} · 泄漏 ${baseline.leaks.length} · 上行 ${baseline.upward.length} · universal 内 node: ${baseline.nodeInUniversal.length}`)
if (unknown.length) {
  console.error(`✖ 未分类文件（规则缺口——必须 0）：\n  ${unknown.join('\n  ')}`)
  process.exit(1)
}
if (thirdParty.length) console.log(`  三方登记（W2 目标 0）：\n    ${thirdParty.slice(0, 8).join('\n    ')}`)
if (baseline.leaks.length) console.log(`  泄漏登记（W2 目标 0——前 10）：\n    ${baseline.leaks.slice(0, 10).join('\n    ')}`)
