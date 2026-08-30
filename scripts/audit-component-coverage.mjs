#!/usr/bin/env node
/**
 * audit-component-coverage.mjs — 组件覆盖哨兵（COMPONENT-ROBUSTNESS 波次 1）
 *
 * 三层映射（组件目录 × 契约 harness / showcase comp / 场景 deep+cap）：
 * - 组件清单：src/client/components/ 目录（PascalCase → kebab-case）
 * - 契约层：src/client/components/*.test.ts（组件目录内契约测试）
 * - showcase 层：apps/showcase/test/comp-<id>.test.ts
 * - 场景层：src/test/scenario/registry.ts（deep-X / cap-X 前缀剥离——
 *   用「星号后缀」字面写法避免注释歧义：deep-X/cap-X）
 * - registry id：apps/showcase/src/registry/components.ts（v2 别名归并——
 *   tree-v2/tree 同源——主页面覆盖即可——既有纪律）
 *
 * 判定：组件 × 三层覆盖矩阵——0 覆盖 = 缺口（exit 1——CI 可挂）——
 * 单层覆盖 = 提示（不阻塞）。先红后绿：缺口清单 = 波次 2 输入。
 */

import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const c = (p) => resolve(root, p)

// ── 1. 组件目录清单（PascalCase → kebab） ──────────────────────────────
// **registry id 命名 = slug（无连字符小写——ContextMenu → contextmenu）**
// 非 kebab——组件目录 PascalCase 直接 toLowerCase 对齐
const slug = (s) => s.toLowerCase()
const compDir = readdirSync(c('src/client/components')).filter((d) =>
  existsSync(c(`src/client/components/${d}`)) && existsSync(c(`src/client/components/${d}/${d}.ts`)),
)
const components = new Map() // kebab → Pascal
for (const d of compDir) {
  const kebab = slug(d)
  components.set(kebab, d)
}

// ── 2. registry id（v2 别名归并） ──────────────────────────────────────
const registrySrc = readFileSync(c('apps/showcase/src/registry/components.ts'), 'utf8')
const registryIds = new Set()
for (const m of registrySrc.matchAll(/"id":\s*"([a-z0-9-]+)"/g)) {
  const id = m[1].replace(/-v2$/, '') // 别名归并（tree-v2 → tree——主页面覆盖即可）
  registryIds.add(id)
}

// ── 3. 契约层（组件目录内 *.test.ts） ──────────────────────────────────
const contractCovered = new Set()
for (const d of compDir) {
  const dir = c(`src/client/components/${d}`)
  if (readdirSync(dir).some((f) => f.endsWith('.test.ts'))) contractCovered.add(slug(d))
}

// ── 4. showcase comp 层 ────────────────────────────────────────────────
const compTests = readdirSync(c('apps/showcase/test')).filter((f) => f.startsWith('comp-') && f.endsWith('.test.ts'))
const showcaseCovered = new Set(
  compTests.map((f) => f.replace(/^comp-/, '').replace(/\.test\.ts$/, ''))
    .map((id) => id.replace(/-v2$/, '')),
)

// ── 5. 场景层（deep-X / cap-X） ──────────────────────────────────────────
const scenarioSrc = readFileSync(c('src/test/scenario/registry.ts'), 'utf8')
const scenarioCovered = new Set()
for (const m of scenarioSrc.matchAll(/id:\s*'(deep|cap)-([a-z0-9-]+)'/g)) {
  scenarioCovered.add(m[2].replace(/-v2$/, ''))
}

// ── 6. 覆盖矩阵 ────────────────────────────────────────────────────────
/** 豁免登记（理由必须具体——零消费/纯展示/重依赖降级） */
const EXEMPT = new Map([
])

const rows = []
for (const [kebab, pascal] of components) {
  const has = {
    harness: contractCovered.has(kebab),
    comp: showcaseCovered.has(kebab),
    scenario: scenarioCovered.has(kebab),
  }
  const layers = Object.values(has).filter(Boolean).length
  rows.push({ kebab, pascal, has, layers })
}

const gaps = rows.filter((r) => r.layers === 0 && !EXEMPT.has(r.kebab))
const thin = rows.filter((r) => r.layers === 1 && !EXEMPT.has(r.kebab))
const exempt = rows.filter((r) => EXEMPT.has(r.kebab))

// ── 7. 输出 ────────────────────────────────────────────────────────────
const pad = (s, n) => String(s).padEnd(n)
console.log('┌─ 组件覆盖矩阵（契约 harness / showcase comp / 场景 deep+cap）─┐')
for (const r of rows) {
  console.log(`│ ${pad(r.kebab, 22)} ${r.has.harness ? 'H' : '.'} ${r.has.comp ? 'C' : '.'} ${r.has.scenario ? 'S' : '.'} ${pad(r.layers, 2)}`)
}
console.log('└──────────────────────────────────────────────────────────┘')
console.log(`组件: ${components.size} · registry id（归并）: ${registryIds.size} · 全覆盖: ${rows.filter((r) => r.layers === 3).length} · 双层: ${rows.filter((r) => r.layers === 2).length} · 单层: ${thin.length} · 零覆盖: ${gaps.length}`)
if (exempt.length) console.log(`豁免: ${exempt.map((r) => r.kebab).join(', ')}`)

if (gaps.length) {
  console.log('\n❌ 缺口（零覆盖——必须补齐——波次 2）:')
  for (const r of gaps) console.log(`   - ${r.kebab}（${r.pascal}）`)
  console.log('\n⚠️ 单层覆盖（提示——建议补 showcase 行为断言）:')
  for (const r of thin) console.log(`   - ${r.kebab}（${r.pascal}: ${Object.entries(r.has).filter(([, v]) => v).map(([k]) => k).join('/')}）`)
  process.exit(1)
}
console.log('✅ 全组件至少双层覆盖——0 缺口')
