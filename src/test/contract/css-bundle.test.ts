/**
 * weifuwu/layout — CSS 装配单源契约（LAYOUT-PLAN W1）
 *
 * 背景（探针实证）：同一样式源曾有**四条装配管线、三种层序语义**——
 *   ① `scripts/build.mjs`（LAYER_OF 五层）      → dist 发布产物
 *   ② `apps/showcase/server.ts`（全塞 `@layer layout`）→ showcase 328 测试环境
 *   ③ `src/test/scenario/server.ts`（同 ②）    → 场景层 128 测试环境
 *   ④ `ctx.ui.css(src 入口)`（零 @layer + Lightning 改写）→ dev 应用面
 * 即「测试环境验证的层序 ≠ 发布产物层序」。现四处共用 `src/client/layout/bundle.ts`。
 *
 * 本契约锁定（防回潮）：
 *   B1 层归属自证：bundle 输出的 (类 → 层) == LAYER_OF 登记（逐类）
 *   B2 发布面一致：dist 产物层归属 == bundle 输出（含 style.css 的 components 层）
 *   B3 层序声明是**活 atrule**：旧 build 取 entry 首行当 head → 未闭合注释把
 *      `@layer tokens, base, layout, utilities, components;` 整条吞掉（postcss 实证
 *      层序语句 0 个 → 优先级退化为块首现顺序 → 改层序声明是空操作）
 *   B4 单源静态断言：四处装配点必须 import bundle.ts 且不含内联 `@layer …{` 拼接
 *   B5 inputs 完备：新鲜度键含 entry + 全部分量文件（+ 全部组件 CSS）
 *   B6 产物可解析：PostCSS parse 通过（tokens 不包裹的冗余 `}` 根因防线）
 *
 * node:test 直跑——零浏览器（契约层纪律）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import postcss from 'postcss'
import { bundleLayout, bundleComponents, layerMapOf, LAYER_OF, LAYER_ORDER } from '../../../src/client/layout/bundle.ts'
import { inventory } from '../../../scripts/layout-inventory.mjs'

const root = join(import.meta.dirname, '..', '..', '..')
const LAYOUT_DIR = join(root, 'src', 'client', 'layout')
const COMPONENTS_DIR = join(root, 'src', 'client', 'components')
const DIST_LAYOUT = join(root, 'dist', 'client', 'layout', 'weifuwu-layout.css')
const DIST_STYLE = join(root, 'dist', 'client', 'components', 'style.css')

/** 层序声明是否为活 atrule（非注释内文本） */
function liveLayerStatement(css: string): string | undefined {
  const parsed = postcss.parse(css)
  const stmt = parsed.nodes.find(
    (n: any) => n.type === 'atrule' && n.name === 'layer' && !n.nodes && String(n.params).includes(','),
  ) as any
  return stmt ? String(stmt.params) : undefined
}

test('B1 层归属自证（bundle 输出 == LAYER_OF 登记——逐类）', async () => {
  const { css } = await bundleLayout(LAYOUT_DIR)
  const map = layerMapOf(css)
  const inv = inventory()
  const bad: string[] = []
  for (const c of inv.classes) {
    const layer = LAYER_OF[c.file.replace(/\.css$/, '')]
    assert.ok(layer, `${c.file} 未登记 LAYER_OF`)
    if (layer === 'tokens') continue // tokens 层文件不包裹（:root/@supports 顶层块）
    const got = map.get(c.name)
    if (got !== layer) bad.push(`${c.name}: 期望 ${layer}（${c.file}）实际 ${got ?? '缺失'}`)
  }
  assert.equal(bad.length, 0, `层归属漂移（改 @import 顺序/LAYER_OF 必须同步）:\n  ${bad.slice(0, 12).join('\n  ')}`)
  // 基线层数量：layout + utilities + base（tokens 不包裹 → 无块）
  const layers = new Set([...map.values()])
  assert.ok(layers.has('layout') && layers.has('utilities') && layers.has('base'), `层集合: ${[...layers]}`)
})

test('B2 发布面一致（dist 产物层归属 == bundle 输出）', async () => {
  if (!existsSync(DIST_LAYOUT) || !existsSync(DIST_STYLE)) {
    console.log('⚠ dist 未构建——B2 可见跳过（npm run build 后复跑；不静默）')
    return
  }
  const layout = await bundleLayout(LAYOUT_DIR)
  const comps = await bundleComponents(LAYOUT_DIR, COMPONENTS_DIR)
  const distLayoutMap = layerMapOf(readFileSync(DIST_LAYOUT, 'utf-8'))
  const distStyleMap = layerMapOf(readFileSync(DIST_STYLE, 'utf-8'))
  const srcLayoutMap = layerMapOf(layout.css)
  const srcStyleMap = layerMapOf(comps.css)
  const diff = (a: Map<string, string>, b: Map<string, string>, label: string): string[] => {
    const out: string[] = []
    for (const [k, v] of a) if (b.get(k) !== v) out.push(`${label} ${k}: dist=${b.get(k) ?? '缺失'} vs 源=${v}`)
    return out
  }
  const d = [...diff(srcLayoutMap, distLayoutMap, 'layout'), ...diff(srcStyleMap, distStyleMap, 'style')]
  assert.equal(d.length, 0, `dist 与源面装配不一致（build 未跑或装配分叉）:\n  ${d.slice(0, 12).join('\n  ')}`)
  // components 层只在 style.css 出现（layout 单文件无组件 CSS）
  assert.equal([...distLayoutMap.values()].includes('components'), false, 'layout 产物不应含 components 层')
  assert.ok([...distStyleMap.values()].includes('components'), 'style.css 必须含 components 层')
})

test('B3 层序声明是活 atrule（未闭合注释吞声明 = 层级序失效根因）', async () => {
  const { css } = await bundleLayout(LAYOUT_DIR)
  const params = liveLayerStatement(css)
  assert.ok(params, `层序声明缺失/被注释吞掉——产物开头: ${css.slice(0, 120)}`)
  assert.equal(params.replace(/\s+/g, ' '), LAYER_ORDER.join(', '), '层序 == LAYER_ORDER 单源')
  // 产物开头不得有未闭合注释（旧 head bug 形态：`/* …` 无 `*/` 直吞后续声明）
  const head = css.slice(0, css.indexOf('@layer'))
  const opens = (head.match(/\/\*/g) || []).length
  const closes = (head.match(/\*\//g) || []).length
  assert.equal(opens, closes, `@layer 声明前的注释必须闭合（opens ${opens} / closes ${closes}）`)
  if (existsSync(DIST_LAYOUT)) {
    assert.ok(liveLayerStatement(readFileSync(DIST_LAYOUT, 'utf-8')), 'dist layout 产物层序声明必须活着')
  }
  if (existsSync(DIST_STYLE)) {
    assert.ok(liveLayerStatement(readFileSync(DIST_STYLE, 'utf-8')), 'dist style.css 层序声明必须活着')
  }
})

test('B4 装配单源（四处装配点 import bundle.ts 且零内联 @layer 拼接）', () => {
  const points = [
    { file: 'scripts/build.mjs', why: 'dist 产物装配' },
    { file: 'apps/showcase/server.ts', why: 'showcase dev CSS 路由' },
    { file: 'src/test/scenario/server.ts', why: '场景层 dev CSS 路由' },
    { file: 'src/server/ui/index.ts', why: 'ctx.ui.css（layout 源面）' },
  ]
  for (const p of points) {
    const src = readFileSync(join(root, p.file), 'utf-8')
    assert.ok(
      /from ['"][^'"]*client\/layout\/bundle\.ts['"]/.test(src),
      `${p.file}（${p.why}）必须 import 装配单源 bundle.ts`,
    )
    // 内联装配形态：把文件内容塞进 `@layer xxx {` 字符串拼接（单源违规回潮）
    const inline = src.match(/`@layer \$\{|'@layer '|"@layer "|@layer layout \{\\n/g)
    assert.equal(inline ? inline.length : 0, 0, `${p.file} 含内联 @layer 拼接（装配必须走 bundle.ts）: ${inline}`)
  }
  // LAYER_OF 单源：只有 bundle.ts 登记（build.mjs 旧副本必须已删）
  const dup = readdirSync(join(root, 'scripts')).filter((f) => /\.mjs$/.test(f))
    .filter((f) => /const LAYER_OF\s*=/.test(readFileSync(join(root, 'scripts', f), 'utf-8')))
  assert.equal(dup.length, 0, `LAYER_OF 副本（单源在 bundle.ts）: ${dup.join(' ')}`)
})

test('B5 inputs 完备（新鲜度键含 entry + 全部分量 + 全部组件 CSS）', async () => {
  const layout = await bundleLayout(LAYOUT_DIR)
  const entryFiles = readdirSync(LAYOUT_DIR).filter((f) => /^_[a-z-]+\.css$/.test(f))
  assert.ok(layout.inputs.includes(join(LAYOUT_DIR, 'weifuwu-layout.css')), 'inputs 含 entry')
  const missing = entryFiles.filter((f) => !layout.inputs.includes(join(LAYOUT_DIR, f)))
  assert.equal(missing.length, 0, `inputs 缺分量文件（改这些文件不会失效缓存）: ${missing.join(' ')}`)

  const comps = await bundleComponents(LAYOUT_DIR, COMPONENTS_DIR)
  const cssDirs = readdirSync(COMPONENTS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .filter((n) => existsSync(join(COMPONENTS_DIR, n, `${n}.css`)))
  const missingCss = cssDirs.filter((n) => !comps.inputs.includes(join(COMPONENTS_DIR, n, `${n}.css`)))
  assert.equal(missingCss.length, 0, `inputs 缺组件 CSS: ${missingCss.slice(0, 8).join(' ')}`)
  assert.ok(comps.inputs.length >= layout.inputs.length + cssDirs.length, 'inputs 计数（layout + 组件 CSS）')
})

test('B6 产物可解析（PostCSS——tokens 不包裹的冗余 } 根因防线）', async () => {
  const layout = await bundleLayout(LAYOUT_DIR)
  const comps = await bundleComponents(LAYOUT_DIR, COMPONENTS_DIR)
  for (const [label, css] of [['layout', layout.css], ['components', comps.css]] as const) {
    try {
      postcss.parse(css)
    } catch (e: any) {
      assert.fail(`${label} 装配产物 PostCSS 解析失败: ${String(e.message).slice(0, 140)}`)
    }
  }
  // 组件 CSS 全量进 components 层（抽样：随机 5 个组件的根类出现在 style 产物中）
  const sample = readdirSync(COMPONENTS_DIR, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)
  for (const name of sample.slice(0, 5)) {
    const cssPath = join(COMPONENTS_DIR, name, `${name}.css`)
    if (!existsSync(cssPath)) continue
    const first = readFileSync(cssPath, 'utf-8').match(/\.wf-[a-z0-9-]+/)
    if (first) assert.ok(comps.css.includes(first[0]), `${name} 的 ${first[0]} 未进装配产物`)
  }
})
