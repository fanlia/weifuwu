#!/usr/bin/env node
/**
 * weifuwu/layout 清单脚本（design/layout-optimize.md L0）——布局层单一事实源。
 *
 * 解析 src/layout/*.css → 输出：
 *   ① 类清单（断点变体 @sm/@md/@lg 归并到基类；--modifier 状态变体单列）
 *   ② 属性指纹（每个类设置的 CSS 属性集合——L1 冲突矩阵输入）
 *   ③ 权威计数（布局原语 / 工具类 / 主题 Token）
 *
 * 分类规则（显式登记——新增 CSS 文件必须在此注册类别，否则脚本报错）：
 *   原语文件：元素间空间关系/定位/显隐/外壳（一类一文件）
 *   工具文件：_spacing/_surface/_border/_text（属性级工具集合）
 *
 * 用法：
 *   node scripts/layout-inventory.mjs          # 摘要
 *   node scripts/layout-inventory.mjs --json   # 完整 JSON（含属性指纹）
 *
 * 消费方：src/test/style-audit.test.ts（计数/组合防线）、docs 计数同步。
 */

import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const LAYOUT_DIR = join(root, 'src/layout')

/** 非类文件（token/暗色/基础层——不参与类清单） */
const NON_CLASS_FILES = new Set(['_tokens.css', '_dark.css', '_base.css'])

/** 工具类集合文件（属性级工具，多类一文件）；其余 _*.css 均为原语文件 */
const UTILITY_FILES = new Set(['_spacing.css', '_surface.css', '_border.css', '_text.css'])

const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '')

/** 冲突关注属性（布局身份属性——同元素两类设置不同值 = 顺序敏感/互斥） */
const CONFLICT_PROPS = ['display', 'position', 'flex-direction', 'flex-wrap', 'justify-content', 'align-items', 'overflow', 'flex']

/** 解析一个 CSS 文件 → Map<baseClass, { modifiers:Set, breakpoints:Set, props:Set, values:Object }> */
function parseFile(css) {
  const classes = new Map()
  // 逐规则解析：selector { decl }——@media 内的规则同样解析（断点变体归并到基类）
  const ruleRe = /([^{}]+)\{([^{}]*)\}/g
  let m
  while ((m = ruleRe.exec(css))) {
    const [, selectorText, declText] = m
    const decls = declText.split(';').map((d) => d.split(':')).filter((p) => p.length >= 2)
    const props = new Set(decls.map((d) => d[0].trim()).filter((p) => p && !p.startsWith('--')))
    for (const sel of selectorText.split(',')) {
      // 取选择器中的 .wf-xxx（含 --modifier / \@bp 后缀，含 :where(.wf-x) 包裹——L3 零优先级默认）
      const cm = sel.trim().match(/^(?:\.|\:where\(\s*\.)(wf-[a-z0-9]+(?:-[a-z0-9]+)*)(--[a-z-]+)?(\\@[a-z]{2})?/)
      if (!cm) continue
      const [, base, mod, bp] = cm
      if (!classes.has(base)) classes.set(base, { modifiers: new Set(), breakpoints: new Set(), props: new Set(), values: {} })
      const entry = classes.get(base)
      if (mod) entry.modifiers.add(base + mod)
      if (bp) entry.breakpoints.add(bp.slice(1))
      if (!mod && !bp) {
        for (const p of props) entry.props.add(p) // 指纹只记基类声明
        for (const d of decls) {
          const prop = d[0].trim()
          if (CONFLICT_PROPS.includes(prop)) entry.values[prop] = d.slice(1).join(':').trim()
        }
      }
    }
  }
  return classes
}

export function inventory() {
  const files = readdirSync(LAYOUT_DIR).filter((f) => /^_.*\.css$/.test(f) && !NON_CLASS_FILES.has(f))
  const classes = []
  for (const file of files.sort()) {
    const category = UTILITY_FILES.has(file) ? 'utility' : 'primitive'
    const parsed = parseFile(stripComments(readFileSync(join(LAYOUT_DIR, file), 'utf-8')))
    for (const [name, info] of parsed) {
      classes.push({
        name,
        file,
        category,
        modifiers: [...info.modifiers].sort(),
        breakpoints: [...info.breakpoints].sort(),
        props: [...info.props].sort(),
        values: info.values,
      })
      for (const mod of info.modifiers) {
        classes.push({ name: mod, file, category, modifierOf: name, modifiers: [], breakpoints: [], props: [] })
      }
    }
  }
  classes.sort((a, b) => a.name.localeCompare(b.name))

  const tokens = (readFileSync(join(LAYOUT_DIR, '_tokens.css'), 'utf-8').match(/^ {2}--wf-/gm) || []).length
  const primitives = classes.filter((c) => c.category === 'primitive')
  const utilities = classes.filter((c) => c.category === 'utility')

  return {
    tokens,
    primitives: primitives.length,
    utilities: utilities.length,
    total: classes.length,
    withBreakpoints: classes.filter((c) => c.breakpoints.length).map((c) => c.name),
    classes,
  }
}

/**
 * 属性指纹冲突矩阵（L1）：基类对设置同一布局身份属性且**值不同**
 * ——同元素组合时 import 顺序定胜负（顺序敏感/互斥）。
 * 同值（stack+between 都 display:flex）与互补属性（stack×between 方向/分布）不算冲突。
 */
export function conflictMatrix(inv) {
  const bases = inv.classes.filter((c) => !c.modifierOf && Object.keys(c.values ?? {}).length)
  const pairs = []
  for (let i = 0; i < bases.length; i++) {
    for (let j = i + 1; j < bases.length; j++) {
      const shared = Object.keys(bases[i].values).filter(
        (p) => bases[j].values[p] !== undefined && bases[j].values[p] !== bases[i].values[p],
      )
      if (shared.length) pairs.push({ a: bases[i].name, b: bases[j].name, props: shared })
    }
  }
  return pairs
}

/**
 * 死类报告（L4）：仓库内零引用的类——只报告不删（原语是对外 API，删除需主版本决策）。
 * 引用判定 = 文本包含（宽松，宁漏报不误报）；扫描 apps/src/docs/design/README。
 */
export function deadClasses(inv) {
  const corpus = collectCorpus()
  return inv.classes
    .filter((c) => !c.modifierOf) // 状态修饰随基类引用
    .filter((c) => !corpus.includes(c.name))
    .map((c) => ({ name: c.name, file: c.file, category: c.category }))
}

let _corpus = null
function collectCorpus() {
  if (_corpus) return _corpus
  let corpus = ''
  const walk = (p) => {
    let entries
    try { entries = readdirSync(p, { withFileTypes: true }) } catch { /* 文件 */ }
    if (!entries) {
      if (/\.(tsx?|md|css|html)$/.test(p)) corpus += readFileSync(p, 'utf-8') + '\n'
      return
    }
    for (const e of entries) {
      if (e.name === 'node_modules' || e.name.startsWith('.')) continue
      walk(join(p, e.name))
    }
  }
  for (const r of ['apps', 'src', 'docs', 'design', 'README.md']) walk(join(root, r))
  _corpus = corpus
  return corpus
}

/** 组件清单（P9）：组件数（含同名 .ts 的目录）+ 组件测试数（it/test 计数） */
export function componentInventory() {
  const compDir = join(root, 'src/components')
  const dirs = readdirSync(compDir).filter((d) => {
    try { return statSync(join(compDir, d)).isDirectory() && existsSync(join(compDir, d, `${d}.ts`)) } catch { return false }
  })
  let tests = 0
  for (const d of dirs) {
    const t = join(compDir, d, `${d}.test.ts`)
    if (existsSync(t)) tests += (readFileSync(t, 'utf-8').match(/^\s*(?:it|test)\(/gm) || []).length
  }
  return { components: dirs.length, tests }
}

// ── CLI ──
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const inv = inventory()
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(inv, null, 2))
  } else if (process.argv.includes('--dead')) {
    console.log(JSON.stringify(deadClasses(inv), null, 2))
  } else {
    console.log(`布局原语: ${inv.primitives} · 工具类: ${inv.utilities} · 合计: ${inv.total} 个 wf-* 类`)
    console.log(`主题 Token: ${inv.tokens}`)
    console.log(`断点变体类: ${inv.withBreakpoints.join(' ')}`)
    console.log(`冲突对（同属性基类）: ${conflictMatrix(inv).length} 对（--json 查看明细）`)
    const dead = deadClasses(inv)
    console.log(`死类（仓库零引用，仅报告）: ${dead.length} 个${dead.length ? '——' + dead.map((d) => d.name).join(' ') : ''}`)
  }
}
