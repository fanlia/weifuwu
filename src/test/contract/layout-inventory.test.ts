/**
 * weifuwu/client/layout 清单契约(设计依据: docs/layout.md §4 类清单 + docs/client.md §4 命名规则)
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
 *   L12/L13/L14 token 面收敛(LAYOUT-PLAN W4):同域同值双名必须 var() 单源(类面 L5c 同款)·
 *      间距双标尺定案(gap 派生自 space 紧一档 + 值冻结 + 预设不覆写派生档)·
 *      layout 类文件 px 字面量登记制(结构魔数白名单——其余 token 化)
 *
 * node:test 直跑——零浏览器(契约层纪律)。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { join } from 'node:path'
import { inventory, conflictMatrix, QUARTET_KEEP, LIB_SURFACE_KEEP, SHOWCASE_PRIVATE } from '../../../scripts/layout-inventory.mjs'
import { LAYER_ORDER } from '../../client/layout/bundle.ts'

const root = join(import.meta.dirname, '..', '..', '..')
const LAYOUT = join(root, 'src/client/layout')

const inv = await inventory()
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
  // 组件-W2 再删 2（motion-md——toast-out 死类清理后唯一消费者退出（motion-lg 先例）；
  // z-tour——唯一消费者 wf-tour-mask/overlay 死类清理（Tour 遮罩从未渲染——bubble 走 DOM 顺序））
  assert.equal(inv.tokens, 176, '主题 Token 数')
  // 断点变体 ⊆ 登记清单(响应式唯一模式:窄隐宽显)
  const allowed = new Set(['wf-flex', 'wf-hidden'])
  const bps = inv.withBreakpoints
  assert.deepEqual([...bps].sort(), [...allowed].sort(), `断点变体类必须有意登记: ${bps}`)
})

test('L2 死类 = 0(消费证据制——四件套豁免登记)', () => {
  // 豁免登记单源：scripts/layout-inventory.mjs（测试与 docs/layout.md §6 共用——改动即同步两处）
  // 四件套语义完备豁免：self-* 对齐四态 3/4 消费——整体保留
  const quartz = new Set(QUARTET_KEEP)
  // **库公共面豁免(2027-XX 登记——showcase components-only 裁剪)**:展示域移除
  // (layout 域/首页 hero/六域导航)后消费证据消失——类属 weifuwu/client/layout npm
  // 公共清单(50 原语 + 90 工具基线)——库类面治理归 layout 包,不随 showcase
  // 消费面裁剪删除。恢复消费或库侧裁剪时从本集合移除。
  const libSurface = new Set(LIB_SURFACE_KEEP)
  const corpus = collectCode(['apps', 'src/client/components'])
  const used = new Set(corpus.match(/(?<=["'`\s{])wf-[a-z0-9]+(?:-[a-z0-9]+)*(?:\\?@[a-z]{2})?(?=["'`\s}])/g) ?? [])
  const dead = bases.filter(
    (c) => c.category !== 'internal' && !quartz.has(c.name) && !libSurface.has(c.name) && ![...used].some((u) => u.replace(/\\?@[a-z]{2}$/, '') === c.name || u === c.name),
  )
  assert.equal(dead.length, 0, `零消费类(删除或登记豁免):\n${dead.map((c) => `  ${c.name} (${c.file})`).join('\n')}`)
})

test('L3 缺口 = 0(使用未定义类归零)', () => {
  // layoutDefined 含生成段（decl 声明——inv 的类清单已并入——单源）
  const defined = new Set([...inv.classes.map((c) => c.name), ...layoutDefined(), ...componentDefined()])
  const corpus = collectCode(['apps', 'src/client/components'])
  const used = new Set(corpus.match(/(?<=["'`\s{])wf-[a-z0-9]+(?:-[a-z0-9]+)*(?:\\?@[a-z]{2})?(?=["'`\s}])/g) ?? [])
  // showcase 页面试样式私有类（270f1542 手写折叠——类属 showcase 演示页——L3 defined 集
  // 只含框架 layout/组件 css——页面级私有类登记豁免（定义在其页面上下文——非库面）
  const showcasePrivate = new Set(SHOWCASE_PRIVATE)
  const missing = [...used].filter((n) => {
    const base = n.replace(/\\?@[a-z]{2}$/, '')
    return !defined.has(base) && !defined.has(n)
  })
  assert.equal(missing.filter((m) => !showcasePrivate.has(m.replace(/\\?@[a-z]{2}$/, ''))).length, 0, `消费侧使用但未定义的类(补类或修消费侧):\n  ${missing.join(' ')}`)
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
  // W5 扩围：docs/client.md §4 同口（50 原语 + 98 工具 + 2 内部——手工维护处必须同步哨兵）
  const clientDoc = readFileSync(join(root, 'docs/client.md'), 'utf-8')
  const line2 = `${inv.primitives} 原语（\`_*.css\`）+ ${inv.utilities} 工具 + ${inv.internals} 内部`
  assert.ok(clientDoc.includes(line2), `docs/client.md 缺计数行: ${line2}`)
  // W5 扩围：docs/layout.md §7 速览表口径（生成器产物——L15 兜底，此处校验表头存在）
  const ref = readFileSync(join(root, 'docs/layout.md'), 'utf-8')
  assert.ok(ref.includes(`| 布局原语 | ${inv.primitives} |`), `docs/layout.md 缺原语计数行`)
  assert.ok(ref.includes(`| 工具类 | ${inv.utilities} |`), `docs/layout.md 缺工具计数行`)
  assert.ok(ref.includes(`| 主题 token | ${inv.tokens} |`), `docs/layout.md 缺 token 计数行`)
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
      // LAYOUT-PLAN W6：minify 机制完整性——@layer 声明必须在（W1 曾因头注释吞掉层序——
      // minify 不得再吞）；注释必须为零（esbuild 剥离——任何残留 = 未 minify 回归）
      assert.match(css, /@layer [^{]+\{/, `${f}: minify 后 @layer 层序声明丢失`)
      assert.ok(!css.includes('/*'), `${f}: minify 后仍有注释（剥离不彻底——构建未走 minify 或 esbuild 版本回退）`)
      if (f.includes('weifuwu-layout')) {
        assert.equal((css.match(/@property/g) || []).length, 9, `${f}: @property 注册数漂移（W2 基线 9）`)
        assert.ok(css.includes('wf-padding-none'), `${f}: 零值档位类丢失（W2 补齐面）`)
      }
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
    '--wf-gap-2xl': '标尺完整性——gap 六档（xs..2xl）已 var() 派生自 space 标尺（紧一档：2xl = space-xl），顶档对称保留（--wf-space-2xl 活）；零消费但删档即标尺出现洞（L13 派生登记同步要求六档齐备）',
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

/** 名词序列是否为另一名的子序列（限定词插入形态：[shadow] ⊂ [surface, shadow]） */
function isQualifierInsertion(a, b) {
  const wa = a.replace(/^--wf-/, '').split('-')
  const wb = b.replace(/^--wf-/, '').split('-')
  if (wa.length >= wb.length) return false
  let i = 0
  for (const w of wb) if (w === wa[i]) i++
  return i === wa.length
}

test('L12 token 双名歼灭（同文件内值全等 + 限定词插入形态 = 别名对 → 必须 var() 单源）', () => {
  // L5c 已在类面歼灭双名（声明指纹全等 = 别名对）；token 面同款债务（W4 探针实证）：
  //   --wf-surface-shadow ≡ --wf-shadow（0 1px 3px rgba(0,0,0,.08)）
  //   --wf-dark-surface-shadow ≡ --wf-dark-shadow（0 1px 3px rgba(0,0,0,.3)）
  // 两边同形——历史双名（亮/暗两主题各一对）。修法：语义名保留、值改 var() 引用（公共面不断）。
  // 判定形态取「限定词插入」（子序列）——只抓同域双名，不抓跳域巧合（--wf-motion-sm 4px ≡
  // --wf-overlay-blur 4px · 240px 三胞胎 · 200px 三胞胎）——后者耦合只会制造隐形爆炸半径
  // （判负登记见 plan W4）。另：--wf-dark-bg-hover ≡ --wf-dark-state-hover（差一词非子序列）
  // 本轮人工定案同款单源化（镜像亮色侧 --wf-color-bg-hover: var(--wf-state-hover) 形态）——
  // 不入启发式（差一词形态误报面大：shadow-sm vs motion-sm 类跳域巧合会被拓）。
  // 值归一：CSS 声明值中的空白无语义——`rgba(0, 0, 0, .08)` 与 `rgba(0,0,0,.08)` 是同一值
  // （W4 实证：亮色侧 --wf-surface-shadow 与 --wf-shadow 就是靠空格差异逃过字面比对的双名）
  const norm = (v) => v.replace(/\s+/g, ' ').replace(/,\s*/g, ',').replace(/\s*\)/g, ')').trim()
  for (const f of ['_tokens.css', '_dark.css', '_presets.css']) {
    const css = readFileSync(join(LAYOUT, f), 'utf-8').replace(/\/\*[\s\S]*?\*\//g, '')
    const decls = new Map()
    for (const m of css.matchAll(/(--wf-[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
      const value = m[2].trim()
      if (/^var\(/.test(value)) continue // 已单源引用形态
      decls.set(m[1], norm(value))
    }
    const byValue = new Map()
    for (const [n, v] of decls) { if (!byValue.has(v)) byValue.set(v, []); byValue.get(v).push(n) }
    const aliases = new Set()
    for (const [v, names] of byValue) {
      if (names.length < 2) continue
      for (const a of names) for (const b of names) {
        if (a !== b && isQualifierInsertion(a, b)) aliases.add(`${a} ≡ ${b} = ${v}（应为 ${a}: var(${b}) 或反向）`)
      }
    }
    assert.equal(aliases.size, 0, `${f}: 同域同值双名（别名对）必须 var() 单源——保留语义名、值改引用:\n  ${[...aliases].join('\n  ')}`)
  }
})

test('L13 间距标尺派生登记（gap = space 紧一档 · 值冻结 · 预设只覆写 space）', () => {
  // 双标尺定案（LAYOUT-PLAN W4）：旧形态 gap/space 同名档位不同值（gap-md 12 vs space-md 16）
  // + compact 预设双份字面量 → 「紧一档」关系只存于 folklore（DX 陷阱：同后缀不同值）。
  // 定案：gap **派生**自 space（关系入代码）——值零变动（探针实证两主题逐档全等：
  // base gap 4/8/12/16/24/32 · compact 3/6/9/12/18/24），预设六档 gap 覆写已删（自动跟随）。
  // 判负：方案 A 归一值（gap-md 12→16）——破坏「容器内间距 < 控件内边距」密度关系，
  //       爆炸半径 gap-* 207 处消费；方案 B 改名去歧义——`wf-gap-*` 是公共工具类名 = 主版本破坏。
  // 推翻条件：设计面定「gap 与 space 同档同值」→ 改派生映射 + 本登记 + 截图甄别。
  const GAP_FROM_SPACE = { xs: 'xs', sm: 'sm', md: '', lg: 'md', xl: 'lg', '2xl': 'xl' } // '' = --wf-space 裸档
  const base = readFileSync(join(LAYOUT, '_tokens.css'), 'utf-8')
  const presets = readFileSync(join(LAYOUT, '_presets.css'), 'utf-8')
  for (const [step, spaceStep] of Object.entries(GAP_FROM_SPACE)) {
    const want = `var(--wf-space${spaceStep ? `-${spaceStep}` : ''})`
    const m = base.match(new RegExp(`--wf-gap-${step}:\\s*([^;]+);`))
    assert.ok(m, `--wf-gap-${step} 声明缺失（标尺洞）`)
    assert.equal(m[1].trim(), want, `gap 标尺必须派生自 space（紧一档）——${step} 档应为 ${want}（字面量 = 关系退回 folklore）`)
  }
  // 预设不得覆写派生档（覆写即绕过派生 → 两标尺再度漂移）
  const overrides = [...new Set([...presets.matchAll(/--wf-gap-[a-z0-9]+/g)].map((m) => m[0]))]
  assert.equal(overrides.length, 0, `预设不得覆写派生的 gap 档（只覆写 space——gap 自动跟随）: ${overrides.join(' ')}`)
  // 值冻结（标尺变更必须有意——含 compact 预设；gap 派生随之变动）
  const SPACE_BASE = { xs: '4px', sm: '8px', '': '12px', md: '16px', lg: '24px', xl: '32px', '2xl': '40px' }
  const SPACE_COMPACT = { xs: '3px', sm: '6px', '': '9px', md: '12px', lg: '18px', xl: '24px', '2xl': '30px' }
  for (const [label, file, table] of [['base', base, SPACE_BASE], ['compact', presets, SPACE_COMPACT]]) {
    for (const [step, want] of Object.entries(table)) {
      const name = `--wf-space${step ? `-${step}` : ''}`
      const m = file.match(new RegExp(`${name}:\\s*([^;]+);`))
      assert.ok(m, `${name} 声明缺失（${label}）`)
      assert.equal(m[1].trim(), want, `${name}（${label}）值变更必须有意——标尺冻结，gap 派生随之变动`)
    }
  }
})

test('L14 layout 类文件 px 字面量登记制（结构魔数白名单——其余 token 化）', async () => {
  // W4 探针：layout 类文件（除 token/dark/presets/base/props）px 字面量 17 处——分类定案：
  //   ① @media 宽度 6 处 → L10 断点单源已治理（非声明面——本断言自然不涉）
  //   ② var(--hook, 回退值) → 钩子默认面（L9b 治理注册）——剥除 var() 后不参与本断言
  //   ③ token 化 2 处：`.wf-card-outline` border 1px → var(--wf-border-width)（与 _border.css 同写法）·
  //      `@keyframes wf-panel-in` -4px → calc(var(--wf-motion-sm) * -1)（与 NavMenu/Command/Menu
  //      三个同语义面板入场同写法——幅度单源）
  //   ④ 剩余 7 处 = 结构魔数（语义不属主题标尺）→ 白名单登记，新增字面量必须登记或 token 化
  const WHITELIST = {
    '_app-shell.css#.wf-nav#gap': '2px——导航项发丝分隔间距（小于 gap-xs 4px：紧贴分组视觉，非标尺档位）',
    '_app-shell.css#.wf-nav-item#min-height': '44px——触控命中区下限（WCAG 2.5.5 / Apple HIG 44pt）——不随密度预设缩放（可访问性地板）',
    '_fill.css#.wf-fill-hover#padding': '2px 4px——hover 底色内缩（与同规则负 margin 成对：视觉零位移的命中区扩展）',
    '_fill.css#.wf-fill-hover#margin': '-2px -4px——同上 bleed 对（padding/负 margin 必须同值成对——token 化会拆开这对关系）',
    '_popup.css#.wf-popup#max-width': '32px——弹层视口内缩 calc(100vw - 32px)（移动端左右各 16px 安全边距）',
    '_surface.css#.wf-pill#border-radius': '999px——胶囊圆角（远大于任何盒高即全圆端；不是标尺档位——token 化无意义）',
    '_surface.css#.wf-elevate:hover#transform': '-2px——hover 微抬升（= motion-sm 4px 半档，无独立档位；入场幅度已走 motion 标尺）',
  }
  const postcss = (await import('postcss')).default
  const stripVars = (v) => {
    let out = v, i
    while ((i = out.indexOf('var(')) !== -1) {
      let depth = 0, j = i + 3
      for (; j < out.length; j++) {
        if (out[j] === '(') depth++
        else if (out[j] === ')') { depth--; if (depth === 0) break }
      }
      out = out.slice(0, i) + out.slice(j + 1)
    }
    return out
  }
  const NON_CLASS = new Set(['_tokens.css', '_dark.css', '_presets.css', '_base.css', '_props.css'])
  const found = new Map()
  for (const f of readdirSync(LAYOUT).filter((x) => x.endsWith('.css') && !NON_CLASS.has(x))) {
    postcss.parse(readFileSync(join(LAYOUT, f), 'utf-8')).walkDecls((d) => {
      const px = [...stripVars(String(d.value)).matchAll(/-?[\d.]+px/g)].map((m) => m[0])
      if (!px.length) return
      const sel = d.parent && d.parent.selector ? String(d.parent.selector).trim() : '(root)'
      found.set(`${f}#${sel}#${d.prop}`, px.join(' '))
    })
  }
  const unregistered = [...found.keys()].filter((k) => !WHITELIST[k])
  assert.equal(
    unregistered.length, 0,
    `layout 类文件新增 px 字面量（token 化或登记白名单+理由）:\n  ${unregistered.map((k) => `${k} = ${found.get(k)}`).join('\n  ')}`,
  )
  const stale = Object.keys(WHITELIST).filter((k) => !found.has(k))
  assert.equal(stale.length, 0, `白名单项已不存在（幽灵登记——token 化或删除后请同步移出）: ${stale.join(' ')}`)
})

test('L15 参考文档生成一致性（docs/layout.md == 生成器输出——新类无文档即红）', () => {
  // docs/layout.md 由 scripts/layout-reference.mjs 机器生成（类清单 = inventory 全量 + 断点/钩子/标尺/零消费示例）
  // ——新类/新 token/新钩子不重新生成即漂移 → --check 非零退出 = 红（“无文档即红”机制化）
  const out = execSync('node scripts/layout-reference.mjs --check', { cwd: root, encoding: 'utf-8' })
  assert.match(out, /最新/)
})

test('L16 悬空 design/ 引用 = 0（docs 单源——机器生成参考替代历史三文档）', () => {
  // 历史：design/ 目录不存在但被 8 处引用（layout-naming.md ×5 · design-language.md ·
  // style-professional-plan.md · CONTRIBUTING「design/ 计划」）——W5 收拢：命名规则入
  // docs/client.md §4、设计语言入 §3、全量类清单入 docs/layout.md（机器生成）。
  const hits = []
  const scan = (p) => {
    let entries
    try { entries = readdirSync(p, { withFileTypes: true }) } catch {
      if (/design\//.test(readFileSync(p, 'utf-8'))) hits.push(p.slice(root.length + 1))
      return
    }
    for (const e of entries) {
      if (e.name === 'node_modules' || e.name.startsWith('.') || e.name === 'dist') continue
      scan(join(p, e.name))
    }
  }
  for (const d of ['src/client', 'scripts', 'docs', 'CONTRIBUTING.md']) scan(join(root, d))
  assert.equal(hits.length, 0, `design/ 悬空引用（设计文档单源已收拢）:\n  ${hits.join('\n  ')}`)
})
