#!/usr/bin/env node
/**
 * 交互完整性静态审计（CLIENT-INTERACTIVITY-PLAN 波次 1+2——2027-09）
 *
 * 四检查（ImageCropper 死交互实证驱动——301 测试全绿但拖拽主路径未接线）：
 *   1. 死变量：let x 声明后全文引用仅 1 次（B 类红线——exit 1）
 *   2. 死函数：const fn = (...) => 引用仅 1 次（B 类红线——exit 1）
 *   3. 注释-实现对账：注释声称 use[A-Z]\w+ 但代码零使用（A 类 warn——文档腐化）
 *   4. 交互面测试对账（L2）：组件分类（拖拽/键盘/浮层/媒体——源码静态特征）
 *      × 测试断言特征（comp-* 展示层 + scenario 场景层 deep/cap 前缀）——
 *      交互类组件必须有「操作 → 状态变化」断言。缺口对照基线
 *      scripts/interactivity-baseline.json（计数基线登记制——只能缩小；
 *      新增缺口 = exit 1；基线清零后转纯红线）
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
  // 3. 注释声称调用路径但代码零使用（A 类）——只对「声称路径」形态报
  //    （ctx.ui.useX / 经 useX）——纯提及（「React useCallback 等价物」/
  //    「useBreakpoint 由用户驱动」等语义说明）不算撒谎。
  for (const m of src.matchAll(/(?:ctx\.ui\.|经\s+)use[A-Z]\w+/g)) {
    const lineIdx = src.slice(0, m.index).split('\n').length - 1
    if (!isComment(lines[lineIdx] ?? '')) continue
    if (exempt(lineIdx)) continue
    const hk = m[0].replace(/^ctx\.ui\.|^经\s+/, '')
    const codeUses = lines.filter((l) => !isComment(l) && l.includes(hk)).length
    if (codeUses === 0) issues.warn.push(`注释声称调用 ${hk} 但代码零使用（文档腐化）`)
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

// ── 检查 4：交互面测试对账（波次 2——L2 断言哨兵） ─────────────────────
// 分类判定（源码静态特征——收窄避免误报）× 测试特征（showcase comp-* +
// scenario deep-*/cap-*——两层任一含特征即覆盖）。
import { existsSync as _ex } from 'node:fs'
import { resolve as _resolve, dirname as _dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
const _root = _resolve(_dirname(fileURLToPath(import.meta.url)), '..')
const scenarioDir = _resolve(_root, 'src/test/scenario')
const scenarioFiles = _ex(scenarioDir)
  ? readdirSync(scenarioDir).filter((f) => f.startsWith('e2e-') && f.endsWith('.test.ts')).map((f) => readFileSync(_resolve(scenarioDir, f), 'utf8')).join('\n')
  : ''

const CLASS_RULES = [
  { tag: '拖拽', src: /pointerdown|mousedown|draggable|setPointerCapture|onDragStart/, test: /mouse\.down|mouse\.move[\s\S]{0,600}mouse\.up|dispatchEvent/ },
  { tag: '键盘', src: /addEventListener\(['"]keydown|onKeydown|e\.key === |\.key\)\s*\{/, test: /keyboard\.press|keyboard\.type|pressSequentially/ },
  { tag: '浮层', src: /openPopup\(|PopupHandle/, test: /portal|Geometry|boundingBox|getBoundingClientRect/ },
  { tag: '媒体', src: /createElement\('canvas'\)|createElement\('video'\)|<video|createElement\('audio'\)/, test: /canvas|video|audio/ },
]

const interGaps = []
for (const dir of readdirSync(ROOT)) {
  if (!statSync(join(ROOT, dir)).isDirectory()) continue
  const files = readdirSync(join(ROOT, dir)).filter((f) => f.endsWith('.ts') && !f.includes('.test.'))
  const src = files.map((f) => readFileSync(join(ROOT, dir, f), 'utf8')).join('\n')
  const slug = dir.toLowerCase()
  const compTestPath = _resolve(_root, `apps/showcase/test/comp-${slug}.test.ts`)
  const testSrc = _ex(compTestPath) ? readFileSync(compTestPath, 'utf8') : ''
  const layerTests = testSrc + '\n' + scenarioFiles
  // 场景层以 deep-<slug>/cap-<slug> 前缀归属组件
  const mine = layerTests.includes(`deep-${slug}`) || layerTests.includes(`cap-${slug}`)
    ? layerTests
    : testSrc
  for (const rule of CLASS_RULES) {
    if (!rule.src.test(src)) continue
    if (mine && rule.test.test(mine)) continue
    interGaps.push({ slug, tag: rule.tag })
  }
}

// 基线登记制（计数——只能缩小）
const baselinePath = _resolve(_root, 'scripts/interactivity-baseline.json')
let baseline = _ex(baselinePath) ? JSON.parse(readFileSync(baselinePath, 'utf8')) : []
const key = (g) => `${g.slug}:${g.tag}`
const baselineSet = new Set(baseline.map(key))
const newGaps = interGaps.filter((g) => !baselineSet.has(key(g)))
console.log(`交互面 L2 对账：分类命中缺口 ${interGaps.length}（基线登记 ${baseline.length} / 新增 ${newGaps.length}）`)
for (const g of interGaps) console.log(`  ${baselineSet.has(key(g)) ? '📋' : '✖'}【${g.slug}】${g.tag}类——测试无「操作→状态变化」断言`)

if (fatalCount > 0 || newGaps.length > 0) {
  if (fatalCount > 0) console.log('✖ B 类红线：死代码 = 写了一半没接完的交互——修复或删除（audit-exempt 登记豁免）')
  if (newGaps.length > 0) console.log('✖ 交互面新增缺口：先补 L2 测试或登记基线（interactivity-baseline.json——只能缩小）')
  process.exit(1)
}
console.log('✔ B 类清零 + 交互面无新增缺口（A 类 warn 档——波次 4 清理后归零）')
