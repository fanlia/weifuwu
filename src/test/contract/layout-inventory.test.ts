/**
 * weifuwu/layout 清单契约(设计依据: §6 + layout-naming.md §7)
 *
 * 布局层单一事实源防线——锁定清理/命名成果,防回潮:
 *   L1 计数基线(登记制):原语/工具/内部/变体——变更必须有意
 *   L2 死类 = 0:每个非内部类在消费侧有证据(四件套豁免登记)
 *   L3 缺口 = 0:消费侧"使用未定义类"归零(@变体归一基类)
 *   L4 非法选择器 = 0:未转义 @ 的类选择器(_flex.css 死规则根因防线)
 *   L5 命名规则:零值形态唯一(none)/对齐域禁物理方向词/双名歼灭(声明指纹)
 *   L5d 零值档位矩阵(登记制):取消面完备性基线——缺口显式可见(LAYOUT-PLAN W0)
 *   L6 文档计数同步:layout-guide/README 数字 == inventory
 *   L8 冲突矩阵(登记制):同属性不同值的基类对 = import 顺序定胜负(顺序敏感)——
 *      消费侧同串共用必须逐对登记(静默顺序敏感 = 不透明——LAYOUT-PLAN W0 激活休眠防线)
 *   L9 层叠机制锁定(LAYOUT-PLAN W2):层序 utilities 在 components 之后(工具类=显式覆盖)·
 *      display 族基类零优先级 :where()(变体恒胜基类——零 !important)·
 *      !important 白名单(仅 prefers-reduced-motion)· 变量钩子 @property 注册完备(inherits:false)
 *   L10/L11 断点与 token 单源(LAYOUT-PLAN W3):媒体查询字面量 ⊆ --wf-bp-* 派生白名单
 *      (每档 V / V-0.02 两形态——bp token 由死面转正为机制源)· token 死面 = 0(登记制)
 *
 * node:test 直跑——零浏览器(契约层纪律)。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { inventory, conflictMatrix } from '../../../scripts/layout-inventory.mjs'
import { LAYER_ORDER } from '../../client/layout/bundle.ts'

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
  assert.equal(inv.utilities, 98, '工具类数(清理后基线)——LAYOUT-PLAN W2 +1：padding-none（零值档位补齐——消费证据：agent-platform FilesSection 工作区文件行按钮内联 reset 四件套转工具类；radius-none 同期判负：零消费证据）；2027-09 +5：text-danger/text-warning/font-mono/rounded-sm/rounded-md/card-outline')
  assert.equal(inv.internals, 2, '内部类数(_popup 框架内部)')
  // token 口径变更（LAYOUT-PLAN W3）：旧按行匹配 `^  --wf-`——同行多声明只计首个
  // （--wf-dark-bg 长期被同值的 --wf-dark-slate-50 遮在行内 → 真实 184 计为 183）；
  // 现按唯一声明名集（与 L11 死面哨兵同一口径）。W3 删 6 死 token → 184 - 6 = 178
  assert.equal(inv.tokens, 178, '主题 Token 数')
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

test('L5d 零值档位矩阵(登记制——取消面完备性基线)', () => {
  // 有标尺的属性域应有 none 档(取消面)——LAYOUT-PLAN W2 补齐 padding:
  //   bg / border / gap / margin / margin-top / padding
  // 消费证据：agent-platform FilesSection.tsx 工作区文件行按钮（旧内联手搜
  //   `padding:0 / border:none / background:none / cursor:pointer` 四件套 → 现全走工具类）
  // 浏览器读数见 e2e-layout-semantics.test.ts ③（W0 基线 24px → W2 后 0px）
  const noneDomains = new Set(
    bases.filter((c) => /-none$/.test(c.name)).map((c) => c.name.replace(/^wf-/, '').replace(/-none$/, '')),
  )
  const BASELINE = ['bg', 'border', 'gap', 'margin', 'margin-top', 'padding']
  assert.deepEqual(
    [...noneDomains].sort(),
    [...BASELINE].sort(),
    `零值档位面变更必须有意(新增=取消面补齐·删除=消费侧断链): ${[...noneDomains].sort()}`,
  )
  // 判负登记(缺口不静默——补齐即响):标尺域中缺 none 档的必须在此写明理由+推翻条件
  const KNOWN_GAPS: Record<string, string> = {
    radius: '判负(LAYOUT-PLAN W2)——零消费证据(L2 消费证据制)；推翻条件:出现取消组件圆角的消费侧实例',
  }
  for (const [domain, why] of Object.entries(KNOWN_GAPS)) {
    assert.ok(!noneDomains.has(domain), `wf-${domain}-none 已补——移出 KNOWN_GAPS 并同步 BASELINE/L1 计数（原登记：${why}）`)
  }
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

test('L8 冲突矩阵（登记制——同属性不同值 = 源顺序定胜负）', () => {
  // conflictMatrix 自 2027-09 导出但零测试消费（防线休眠）——本断言激活：
  // 冲突对 = 两基类设同一布局身份属性且值不同 → 同元素共挂时胜者由
  // weifuwu-layout.css 的 @import 顺序（同层）或 specificity 决定——改导入顺序即改行为。
  const pairs = conflictMatrix(inv)
  assert.equal(pairs.length, 169, '冲突对基线（变更必须有意：新增 = 新顺序敏感面 / 减少 = 属性收敛）')

  // 消费侧同串共用（同一 class 字符串内两类同挂 = 同元素）必须逐对登记：
  // 登记内容 = 实证胜者（浏览器 getComputedStyle 读数）+ 胜因（specificity / 源顺序）。
  // 未登记的共用对 = 静默顺序敏感（改 @import 顺序无声翻转页面）——即红。
  const REGISTERED: Record<string, string> = {
    // 实证：wrap=nowrap——同 specificity（0,1,0）下 _nowrap 后于 _row → 显式禁换行意图胜
    // （消费侧：apps/showcase/src/shell.tsx 平台域导航——横向滚动导航条，意图正确）
    'wf-nowrap×wf-row': 'flex-wrap → nowrap（_nowrap 后于 _row——显式禁换行意图胜）',
    // LAYOUT-PLAN W2 已清理的冗余共用（登记随之退场——stale 断言会红）：
    //   wf-center×wf-stack（not-found.tsx——center 已含 column flex，stack 冗余）
    //   wf-row×wf-stack（demos/data-feedback.tsx——意图是 column，wf-row 是笔误）
    // 两组合的引擎行为仍由场景契约 ⑤ 记录（wf-row wf-stack → column）——框架面不隐藏
  }
  const key = (p: { a: string; b: string }): string => [p.a, p.b].sort().join('×')
  const lits = (collectCode(['apps', 'src/client/components']).match(/['"`]([^'"`\n]*)['"`]/g) ?? [])
    .map((s) => s.slice(1, -1))
    .filter((s) => s.includes('wf-'))
  const coUsed = new Map<string, number>()
  for (const p of pairs) {
    const n = lits.filter((l) => { const cs = l.split(/\s+/); return cs.includes(p.a) && cs.includes(p.b) }).length
    if (n) coUsed.set(key(p), n)
  }
  const unregistered = [...coUsed.keys()].filter((k) => !(k in REGISTERED))
  assert.equal(
    unregistered.length, 0,
    `同元素共用的冲突对未登记（胜者由源顺序静默决定——登记胜者+胜因或拆开共用）:\n${unregistered.join('\n')}`,
  )
  const stale = Object.keys(REGISTERED).filter((k) => !coUsed.has(k))
  assert.equal(stale.length, 0, `登记已陈旧（消费侧不再同串共用——移除登记）: ${stale.join(' ')}`)
  assert.deepEqual(
    [...coUsed.keys()].sort(),
    Object.keys(REGISTERED).sort(),
    '共用对集合 == 登记集合（逐对可追溯）',
  )
})

test('L9a 层叠机制锁定（层序 utilities 最后 · display 族 :where · 零 !important 变通）', async () => {
  const postcss = (await import('postcss')).default
  // ① 层序：工具类 = 消费侧显式覆盖意图 → 必须胜组件自身样式
  //   （旧序实证：`.wf-card--pad-lg + .wf-padding-xs` → 24px 工具类被吞 ·
  //    `.wf-btn + .wf-hidden` → inline-flex 隐藏失效——当时靠 !important 变通）
  assert.ok(
    LAYER_ORDER.indexOf('utilities') > LAYER_ORDER.indexOf('components'),
    `utilities 必须在 components 之后（当前：${LAYER_ORDER.join(' → ')}）`,
  )

  // ② display 族基类零优先级（:where）+ 变体正常优先级 → 变体恒胜基类（与文件顺序无关）
  const DISPLAY_FAMILY = ['wf-block', 'wf-flex', 'wf-hidden']
  const plain: string[] = []
  const whereForm = new Set<string>()
  for (const f of ['_block.css', '_flex.css', '_hidden.css']) {
    const parsed = postcss.parse(readFileSync(join(LAYOUT, f), 'utf-8'))
    parsed.walkRules((r) => {
      for (const sel of r.selector.split(',').map((s) => s.trim())) {
        const bare = sel.match(/^\.wf-(block|flex|hidden)$/)
        if (bare) plain.push(`${f}: ${sel}`)
        const zero = sel.match(/^:where\(\.(wf-(?:block|flex|hidden))\)$/)
        if (zero) whereForm.add(zero[1])
      }
    })
  }
  assert.equal(plain.length, 0, `display 族基类必须 :where() 零优先级（否则变体靠文件顺序定胜负）: ${plain.join(' ')}`)
  assert.deepEqual([...whereForm].sort(), [...DISPLAY_FAMILY].sort(), 'display 族三基类均需 :where 形态')

  // ③ !important 白名单：仅 prefers-reduced-motion（无障碍强制）——断点变体/display 族零使用
  const sites: string[] = []
  for (const f of readdirSync(LAYOUT).filter((x) => x.endsWith('.css'))) {
    const parsed = postcss.parse(readFileSync(join(LAYOUT, f), 'utf-8'))
    parsed.walkDecls((d) => {
      if (!d.important) return
      let reducedMotion = false
      let p: any = d.parent
      while (p && p.type !== 'root') {
        if (p.type === 'atrule' && /prefers-reduced-motion/.test(String(p.params))) reducedMotion = true
        p = p.parent
      }
      const sel = d.parent && d.parent.type === 'rule' ? (d.parent as any).selector : ''
      if (!reducedMotion) sites.push(`${f}: ${sel} { ${d.prop} }`)
      assert.ok(!/\\@/.test(sel), `断点变体禁用 !important（变体靠 specificity 恒胜基类）: ${f} ${sel}`)
    })
  }
  assert.equal(sites.length, 0, `layout 层 !important 只允许 prefers-reduced-motion（白名单外 = 层序/specificity 未解决的回退）:\n  ${sites.join('\n  ')}`)
})

test('L9b 变量钩子注册完备（@property inherits:false——污染根治 + 零幽灵钩子）', async () => {
  const postcss = (await import('postcss')).default
  const parse = (f: string) => postcss.parse(readFileSync(join(LAYOUT, f), 'utf-8'))

  // token 面已声明的变量（_tokens/_dark/_presets）
  const declared = new Set<string>()
  for (const f of ['_tokens.css', '_dark.css', '_presets.css']) {
    parse(f).walkDecls((d) => { if (d.prop.startsWith('--wf-')) declared.add(d.prop) })
  }
  // _props.css 注册的钩子（必须 inherits:false）
  const registered = new Map<string, string>()
  parse('_props.css').walkAtRules('property', (r) => {
    const name = r.params.trim()
    let inherits = ''
    ;(r as any).walkDecls((d: any) => { if (d.prop === 'inherits') inherits = d.value })
    registered.set(name, inherits)
    assert.equal(inherits, 'false', `${name} 必须 inherits:false（否则外层钩子污染子孙原语）`)
  })

  // layout 全面的钩子消费：var(--wf-X, fallback) 且 X 未在 token 面声明 = 钩子
  const hooks = new Map<string, string[]>()
  for (const f of readdirSync(LAYOUT).filter((x) => x.endsWith('.css') && x !== '_props.css')) {
    const parsed = parse(f)
    parsed.walkDecls((d) => {
      for (const m of String(d.value).matchAll(/var\(\s*(--wf-[a-z0-9-]+)\s*,/g)) {
        const name = m[1]
        if (declared.has(name)) continue
        if (!hooks.has(name)) hooks.set(name, [])
        hooks.get(name)!.push(f)
      }
    })
  }
  const unregistered = [...hooks.keys()].filter((h) => !registered.has(h))
  assert.equal(
    unregistered.length, 0,
    `钩子未注册 @property（继承污染面 + 幽灵变量）:\n  ${unregistered.map((h) => `${h} ← ${[...new Set(hooks.get(h)!)].join(' ')}`).join('\n  ')}`,
  )
  const dead = [...registered.keys()].filter((r) => !hooks.has(r))
  assert.equal(dead.length, 0, `注册了但零消费的钩子（声明无行为 = 不透明）: ${dead.join(' ')}`)
})

test('L10 断点单源（媒体查询字面量 ⊆ --wf-bp-* 派生白名单）', () => {
  // CSS 媒体查询语法不能 var() → --wf-bp-* 结构性无法被样式直接消费（W0 探针：4 token
  // 零引用 = 死面）。本断言使其**转正为机制单源**：合法字面量由 token 派生——每档 V
  // 允许两形态 `V`（min-width）与 `V - 0.02`（max-width），二者无缝对接（不留 0.98px 死区）。
  // W3 前实证碎片：components 面 `max-width:639px` ×3（Modal/Drawer/DatePicker）+ `767px` ×1
  // （Transfer）vs layout 面 `767.98px`——同一边界两种写法，767.00–767.98 区间两侧规则同时失配
  // （已归一为 639.98/767.98）。新增断点 = 改 token 一处（白名单自动扩展）。
  const tokens = readFileSync(join(LAYOUT, '_tokens.css'), 'utf-8')
  const bps = [...tokens.matchAll(/--wf-bp-[a-z0-9]+:\s*([\d.]+)px/g)].map((m) => parseFloat(m[1]))
  assert.ok(bps.length >= 3, `--wf-bp-* 是断点单源——档数不得少于 3（当前 ${bps.length}）`)
  const allowed = new Set()
  for (const v of bps) { allowed.add(String(v)); allowed.add((v - 0.02).toFixed(2)) }

  const offenders = []
  const scan = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const fp = join(dir, e.name)
      if (e.isDirectory()) { if (e.name !== 'node_modules') scan(fp); continue }
      if (!e.name.endsWith('.css')) continue
      const css = readFileSync(fp, 'utf-8').replace(/\/\*[\s\S]*?\*\//g, '')
      for (const m of css.matchAll(/@media[^{]*/g)) {
        for (const w of m[0].matchAll(/(min|max)-width:\s*([\d.]+)px/g)) {
          if (!allowed.has(w[2])) offenders.push(`${fp.slice(root.length + 1)}: ${w[1]}-width:${w[2]}px`)
        }
      }
    }
  }
  scan(join(root, 'src/client/layout'))
  scan(join(root, 'src/client/components'))
  assert.equal(
    offenders.length, 0,
    `媒体查询宽度字面量必须来自 --wf-bp-*（每档 V / V-0.02 两形态）:\n  ${offenders.join('\n  ')}\n  合法集: ${[...allowed].join(' / ')}`,
  )
})

test('L11 token 死面 = 0（登记制——消费证据跨 src+apps）', () => {
  // 声明面 = layout token 三文件（_tokens/_dark/_presets）；消费面 = src/client + apps 的
  // .css（var() 形态——声明行不算）与 .ts/.tsx（字面形态——TS 面无声明形态），排除测试文件
  // （测试引用不算产品消费）。W3 前实证 12 个零消费 token，逐条定案：
  //   删 6（dark-slate-50 与 dark-bg 同值双声明 · letter-spacing = CSS 初始值 ·
  //        letter-spacing-wider 零消费 · motion-lg 注释称 drawer 位移但实证用 translateX(±100%) ·
  //        opacity-overlay 与活的 --wf-overlay:rgba(0,0,0,.4) 同值双声明 · state-selected 判负）
  //   留 1（gap-2xl——标尺完整性）· 转正 4（bp-* → L10 机制单源）· 活 1（pop-z——showcase 消费）
  const declared = new Set()
  for (const f of ['_tokens.css', '_dark.css', '_presets.css']) {
    for (const m of readFileSync(join(LAYOUT, f), 'utf-8').matchAll(/^\s*(--wf-[a-z0-9-]+)\s*:/gm)) declared.add(m[1])
  }
  const used = new Set()
  const scan = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const fp = join(dir, e.name)
      if (e.isDirectory()) {
        if (e.name === 'node_modules' || e.name === 'dist' || e.name === 'test') continue
        scan(fp); continue
      }
      if (/\.test\./.test(e.name)) continue
      const src = readFileSync(fp, 'utf-8')
      if (e.name.endsWith('.css')) {
        for (const m of src.matchAll(/var\(\s*(--wf-[a-z0-9-]+)/g)) used.add(m[1])
      } else if (/\.tsx?$/.test(e.name)) {
        for (const m of src.matchAll(/--wf-[a-z0-9-]+/g)) used.add(m[0])
      }
    }
  }
  scan(join(root, 'src/client'))
  scan(join(root, 'apps'))

  // 零消费但保留的 token 必须逐条写明理由（否则 = 死面 → 删除）
  const BP_WHY = '机制单源（L10 断点白名单派生源）——CSS 媒体查询语法不能 var()，结构性不可被样式直接消费'
  const KEEP = {
    '--wf-gap-2xl': '标尺完整性——gap 六档（xs..2xl）与 space 六档对称（--wf-space-2xl 活）；且 _presets.css 紧凑预设同步覆写该档——删除即预设面出现无基档对应的覆写',
    '--wf-bp-sm': BP_WHY,
    '--wf-bp-md': BP_WHY,
    '--wf-bp-lg': BP_WHY,
    '--wf-bp-xl': `${BP_WHY}（1280 档当前无媒体消费者——保留为公共断点面下一档）`,
  }

  const dead = [...declared].filter((t) => !used.has(t)).sort()
  const unregistered = dead.filter((t) => !KEEP[t])
  assert.equal(
    unregistered.length, 0,
    `零消费 token（删除或登记豁免+理由）——死面 = 不透明:\n  ${unregistered.join('\n  ')}\n  已登记: ${Object.keys(KEEP).join(' ')}`,
  )
  // 反向①：登记项已被消费 → 移出登记（防登记表腐化为「永不清理」）
  const stale = Object.keys(KEEP).filter((t) => used.has(t))
  assert.equal(stale.length, 0, `登记项已有消费者——移出 KEEP（登记只容纳结构性零消费）: ${stale.join(' ')}`)
  // 反向②：登记项已无声明 → 幽灵登记
  const gone = Object.keys(KEEP).filter((t) => !declared.has(t))
  assert.equal(gone.length, 0, `登记项已无声明（幽灵登记）: ${gone.join(' ')}`)
})
