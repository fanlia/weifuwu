/**
 * weifuwu/layout 清单契约(设计依据: §6 + layout-naming.md §7)
 *
 * 布局层单一事实源防线——锁定清理/命名成果,防回潮:
 *   L1 计数基线(登记制):原语/工具/内部/变体——变更必须有意
 *   L2 死类 = 0:每个非内部类在消费侧有证据(四件套豁免登记)
 *   L3 缺口 = 0:消费侧"使用未定义类"归零(@变体归一基类)
 *   L4 非法选择器 = 0:未转义 @ 的类选择器(_flex.css 死规则根因防线)
 *   L5 命名规则:零值形态唯一(none)/对齐域禁物理方向词/双名歼灭(声明指纹)
 *   L6 文档计数同步:layout-guide/README 数字 == inventory
 *
 * node:test 直跑——零浏览器(契约层纪律)。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { inventory } from '../../../scripts/layout-inventory.mjs'

const root = join(import.meta.dirname, '..', '..', '..')
const LAYOUT = join(root, 'src/client/layout')

const inv = inventory()
const bases = inv.classes.filter((c) => !c.modifierOf)

/** 收集语料(.ts/.tsx——真实代码消费,不含文档提及/静态 HTML) */
function collectCode(dirs) {
  const out = []
  const walk = (p) => {
    let entries
    try { entries = readdirSync(p, { withFileTypes: true }) } catch { return }
    for (const e of entries) {
      if (e.name === 'node_modules' || e.name.startsWith('.')) continue
      const fp = join(p, e.name)
      if (e.isDirectory()) walk(fp)
      else if (/\.tsx?$/.test(e.name)) out.push(readFileSync(fp, 'utf-8'))
    }
  }
  for (const d of dirs) walk(join(root, d))
  return out.join('\n')
}

/** layout 定义集:全部 _*.css 中出现的 .wf-* 选择器(含子孙/:where 位置) */
function layoutDefined() {
  const set = new Set()
  for (const f of readdirSync(LAYOUT).filter((f) => f.endsWith('.css'))) {
    for (const m of readFileSync(join(LAYOUT, f), 'utf-8').matchAll(/\.wf-[a-z0-9]+(?:-[a-z0-9]+)*/g)) {
      set.add(m[0].slice(1))
    }
  }
  return set
}

/** 组件类定义集:组件 .css/.ts 中出现的类名(组件自持类——非消费) */
function componentDefined() {
  const set = new Set()
  const walk = (p) => {
    for (const e of readdirSync(p, { withFileTypes: true })) {
      const fp = join(p, e.name)
      if (e.isDirectory()) walk(fp)
      else if (/\.(css|ts)$/.test(e.name)) {
        for (const m of readFileSync(fp, 'utf-8').matchAll(/(?<=["'`.\s])wf-[a-z0-9]+(?:-[a-z0-9]+)*/g)) {
          set.add(m[0])
        }
      }
    }
  }
  walk(join(root, 'src/client/components'))
  return set
}

test('L1 计数基线(登记制——变更必须有意)', () => {
  assert.equal(inv.primitives, 50, '布局原语数(清理后基线)——2027-09 +1：fill-hover（消费侧欠账补定义——L3 缺口修复）')
  assert.equal(inv.utilities, 97, '工具类数(清理后基线)——2027-09 +5：text-danger/text-warning/font-mono/rounded-sm/rounded-md/card-outline（同批补定义——_base 非类文件迁移归属：rounded/card 归 _surface 域）')
  assert.equal(inv.internals, 2, '内部类数(_popup 框架内部)')
  assert.equal(inv.tokens, 183, '主题 Token 数')
  // 断点变体 ⊆ 登记清单(响应式唯一模式:窄隐宽显)
  const allowed = new Set(['wf-flex', 'wf-hidden'])
  const bps = inv.withBreakpoints
  assert.deepEqual([...bps].sort(), [...allowed].sort(), `断点变体类必须有意登记: ${bps}`)
})

test('L2 死类 = 0(消费证据制——四件套豁免登记)', () => {
  // 四件套语义完备豁免(设计:layout-naming.md §4):self-* 对齐四态 3/4 消费——整体保留
  const QUARTET_KEEP = new Set(['wf-self-stretch', 'wf-self-start'])
  // **库公共面豁免(2027-XX 登记——showcase components-only 裁剪)**:展示域移除
  // (layout 域/首页 hero/六域导航)后消费证据消失——类属 weifuwu/layout npm
  // 公共清单(50 原语 + 90 工具基线)——库类面治理归 layout 包,不随 showcase
  // 消费面裁剪删除。恢复消费或库侧裁剪时从本集合移除。
  const LIB_SURFACE_KEEP = new Set([
    'wf-absolute', 'wf-cover', 'wf-layer', 'wf-nav', 'wf-nav-group',
    'wf-radius-lg', 'wf-safe-bottom', 'wf-safe-top',
  ])
  const corpus = collectCode(['apps', 'src/client/components'])
  const used = new Set(corpus.match(/(?<=["'`\s{])wf-[a-z0-9]+(?:-[a-z0-9]+)*(?:\\?@[a-z]{2})?(?=["'`\s}])/g) ?? [])
  const dead = bases.filter(
    (c) => c.category !== 'internal' && !QUARTET_KEEP.has(c.name) && !LIB_SURFACE_KEEP.has(c.name) && ![...used].some((u) => u.replace(/\\?@[a-z]{2}$/, '') === c.name || u === c.name),
  )
  assert.equal(dead.length, 0, `零消费类(删除或登记豁免):\n${dead.map((c) => `  ${c.name} (${c.file})`).join('\n')}`)
})

test('L3 缺口 = 0(使用未定义类归零)', () => {
  const defined = new Set([...layoutDefined(), ...componentDefined()])
  const corpus = collectCode(['apps', 'src/client/components'])
  const used = new Set(corpus.match(/(?<=["'`\s{])wf-[a-z0-9]+(?:-[a-z0-9]+)*(?:\\?@[a-z]{2})?(?=["'`\s}])/g) ?? [])
  // showcase 页面试样式私有类（270f1542 手写折叠——类属 showcase 演示页——L3 defined 集
  // 只含框架 layout/组件 css——页面级私有类登记豁免（定义在其页面上下文——非库面）
  const SHOWCASE_PRIVATE = new Set(['wf-variant-toggle', 'wf-variant-chevron', 'wf-variant-name', 'wf-variant-desc'])
  const missing = [...used].filter((n) => {
    const base = n.replace(/\\?@[a-z]{2}$/, '')
    return !defined.has(base) && !defined.has(n)
  })
  assert.equal(missing.filter((m) => !SHOWCASE_PRIVATE.has(m.replace(/\\?@[a-z]{2}$/, ''))).length, 0, `消费侧使用但未定义的类(补类或修消费侧):\n  ${missing.join(' ')}`)
})

test('L4 无非法选择器(未转义 @ 即整条规则被浏览器丢弃)', () => {
  const bad = []
  for (const f of readdirSync(LAYOUT).filter((f) => f.endsWith('.css'))) {
    const css = readFileSync(join(LAYOUT, f), 'utf-8')
    for (const m of css.matchAll(/\.wf-[a-z0-9-]+@[a-z]/g)) bad.push(`${f}: ${m[0]}`)
  }
  assert.equal(bad.length, 0, `未转义 @ 的类选择器(应为 \\\\@):\n${bad.join('\n')}`)
})

test('L5a 零值形态唯一(重置类统一 none——数值属性值类登记豁免)', () => {
  // wf-min-width-0:数值是属性语义值(非重置约定)——登记豁免(命名规则唯一例外)
  const NUMERIC_VALUE_KEEP = new Set(['wf-min-width-0'])
  const zeros = bases.filter((c) => /-0$/.test(c.name) && !NUMERIC_VALUE_KEEP.has(c.name))
  assert.equal(zeros.length, 0, `零值必须用 none 形态: ${zeros.map((c) => c.name)}`)
})

test('L5b 对齐域禁物理方向词(CSS 值词表)', () => {
  const bad = bases.filter((c) => /^wf-(items|self|justify)-(top|bottom|left|right)$/.test(c.name))
  assert.equal(bad.length, 0, `对齐域类名必须用 start/center/end/stretch/between: ${bad.map((c) => c.name)}`)
})

test('L5c 双名歼灭(声明指纹全等 = 别名对)', () => {
  // 归一化:每条规则 (完整选择器, 排序声明集) 归属其类——指纹全等的两个类 = 别名
  const fp = new Map()
  for (const f of readdirSync(LAYOUT).filter((f) => f.endsWith('.css'))) {
    const css = readFileSync(join(LAYOUT, f), 'utf-8').replace(/\/\*[\s\S]*?\*\//g, '')
    for (const m of css.matchAll(/([^{}@]+)\{([^{}]*)\}/g)) {
      const [, selText, body] = m
      const decls = body.split(';').map((s) => s.trim()).filter(Boolean).sort().join(';')
      for (const sel of selText.split(',').map((s) => s.trim()).filter(Boolean)) {
        const cm = sel.match(/\.wf-[a-z0-9]+(?:-[a-z0-9]+)*(?:--[a-z-]+)?/)
        if (!cm) continue
        const owner = cm[0].slice(1)
        if (!fp.has(owner)) fp.set(owner, [])
        fp.get(owner).push(`${sel.replace(/\s+/g, ' ')}{${decls}}`)
      }
    }
  }
  const byFp = new Map()
  for (const [name, entries] of fp) {
    const key = entries.sort().join('\n')
    if (!byFp.has(key)) byFp.set(key, [])
    byFp.get(key).push(name)
  }
  const aliases = [...byFp.values()].filter((ns) => ns.length > 1)
  assert.equal(aliases.length, 0, `同一声明多类名(保留一个,其余迁移消费侧):\n${aliases.map((ns) => '  ' + ns.join(' ≡ ')).join('\n')}`)
})

test('L6 文档计数同步(README == inventory)', () => {
  const readme = readFileSync(join(root, 'README.md'), 'utf-8')
  const line = `${inv.primitives} 个布局原语 + ${inv.utilities} 个工具类 + ${inv.tokens} 个主题 Token`
  assert.ok(readme.includes(line), `README.md 缺计数行: ${line}`)
})

test('L7 构建产物 CSS 可解析（dist PostCSS 合格——style.css 500 根因防线）', async () => {
  // 根因：_tokens.css @supports 块被 @layer 包裹产生冗余 } → PostCSS Unexpected }
  // → ctx.ui.css 编译崩 → /static/style.css 500（页面样式全挂）——契约锁定构建管线健康
  const distFiles = [
    join(root, 'dist', 'client', 'layout', 'weifuwu-layout.css'),
    join(root, 'dist', 'client', 'components', 'style.css'),
  ]
  for (const f of distFiles) {
    const exists = (await import('node:fs')).existsSync(f)
    if (!exists) continue // dist 未构建——跳过（构建后用 test:client 验证）
    const postcss = await import('postcss')
    try {
      const css = readFileSync(f, 'utf-8')
      await postcss.default.parse(css)
    } catch (e: any) {
      assert.fail(`${f}: PostCSS 解析失败（构建产物损坏——500 根因）: ${String(e.message).slice(0, 120)}`)
    }
  }
})
