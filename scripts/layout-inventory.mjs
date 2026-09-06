#!/usr/bin/env node
/**
 * weifuwu/layout 清单脚本（ L0）——布局层单一事实源。
 *
 * 解析 src/client/layout/*.css → 输出：
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
 * 消费方：src/client/layout/style-audit.test.ts（计数/组合防线）、docs 计数同步。
 */

import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const LAYOUT_DIR = join(root, 'src/client/layout')

/** 非类文件（token/暗色/基础层——不参与类清单） */
const NON_CLASS_FILES = new Set(['_tokens.css', '_dark.css', '_base.css'])

/** 工具类集合文件（属性级工具，多类一文件）；其余 _*.css 均为原语文件 */
const UTILITY_FILES = new Set(['_spacing.css', '_surface.css', '_border.css', '_text.css'])

/** 内部实现文件（框架自身消费——非用户词汇：不计入原语/工具计数） */
const INTERNAL_FILES = new Set(['_popup.css'])

/** 消费证据豁免登记（L2/L3 与 docs/layout.md §6 共用——单源）
 *  - QUARTET_KEEP：self-* 对齐四态语义完备（四态 3/4 消费——整体保留）
 *  - LIB_SURFACE_KEEP：库公共面（showcase components-only 裁剪后消费证据消失——类属
 *    weifuwu/layout npm 公共清单，退出消费或库侧裁剪时才从本集合移除）
 *  - SHOWCASE_PRIVATE：showcase 演示页私有样式类（定义在页面上下文——非库面）
 */
export const QUARTET_KEEP = ['wf-self-stretch', 'wf-self-start']
export const LIB_SURFACE_KEEP = [
  'wf-absolute', 'wf-cover', 'wf-layer', 'wf-nav', 'wf-nav-group',
  'wf-radius-lg', 'wf-safe-bottom', 'wf-safe-top',
]
export const SHOWCASE_PRIVATE = ['wf-variant-toggle', 'wf-variant-chevron', 'wf-variant-name', 'wf-variant-desc']

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

export async function inventory() {
  const files = readdirSync(LAYOUT_DIR).filter((f) => /^_.*\.css$/.test(f) && !NON_CLASS_FILES.has(f))
  // **生成段（defineLayout——原语声明单源——行 87 的 _stack.css 锚点）**：
  // row/stack 族由声明生成（手写 _row.css/_stack.css 已删除——bundle 同源）
  const { generateLayoutCss } = await import('../src/client/layout/define.ts')
  const { structures } = await import('../src/client/layout/decl.ts')
  const generated = generateLayoutCss(structures)
  const classes = []
  const allFiles = [...files.sort()]
  if (!allFiles.includes('_stack.css')) allFiles.push('_stack.css') // 删除后锚点缺失——补位（类面=生成段）
  for (const file of allFiles) {
    const category = INTERNAL_FILES.has(file) ? 'internal' : UTILITY_FILES.has(file) ? 'utility' : 'primitive'
    // _stack.css 锚点（顺序占位——文件已删）——类面 = 声明生成段
    let css = file === '_stack.css' ? generated : stripComments(readFileSync(join(LAYOUT_DIR, file), 'utf-8'))
    const parsed = parseFile(css)
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

  // token 计数 = 唯一声明名集（旧口径按行匹配 `^  --wf-`——同行多声明只计一次，
  // 删同值双声明（dark-slate-50/dark-bg 同行）后行仍在 → 计数漂移 1；
  // LAYOUT-PLAN W3 改为名集口径——与 L11 死面哨兵同一声明面）
  const tokens = new Set(
    [...readFileSync(join(LAYOUT_DIR, '_tokens.css'), 'utf-8').matchAll(/^\s*(--wf-[a-z0-9-]+)\s*:/gm)].map((m) => m[1]),
  ).size
  const primitives = classes.filter((c) => c.category === 'primitive')
  const utilities = classes.filter((c) => c.category === 'utility')

  return {
    tokens,
    primitives: primitives.length,
    utilities: utilities.length,
    internals: classes.filter((c) => c.category === 'internal').length,
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
 * 引用判定 = 文本包含（宽松，宁漏报不误报）；扫描 apps/src 代码面（docs/layout.md 生成物不回喂）。
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
      if (e.name === 'layout.md') continue // 机器生成参考（由 inventory 生成——不得回喂语料，否则死类检测空转）
      walk(join(p, e.name))
    }
  }
  for (const r of ['apps', 'src', 'docs', 'design', 'README.md']) walk(join(root, r))
  _corpus = corpus
  return corpus
}

/** 组件清单（P9）：组件数（含同名 .ts 的目录）+ 组件测试数（it/test 计数） */
export function componentInventory() {
  const compDir = join(root, 'src/client/components')
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
  const inv = await inventory()
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(inv, null, 2))
  } else if (process.argv.includes('--dead')) {
    console.log(JSON.stringify(deadClasses(inv), null, 2))
  } else {
    console.log(`布局原语: ${inv.primitives} · 工具类: ${inv.utilities} · 内部类: ${inv.internals} · 合计: ${inv.total} 个 wf-* 类`)
    console.log(`主题 Token: ${inv.tokens}`)
    console.log(`断点变体类: ${inv.withBreakpoints.join(' ')}`)
    console.log(`冲突对（同属性基类）: ${conflictMatrix(inv).length} 对（--json 查看明细）`)
    const dead = deadClasses(inv)
    console.log(`死类（仓库零引用，仅报告）: ${dead.length} 个${dead.length ? '——' + dead.map((d) => d.name).join(' ') : ''}`)
  }
}
