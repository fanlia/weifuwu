/**
 * weifuwu/layout — CSS 装配单源（LAYOUT-PLAN W1）
 *
 * **为什么在这里**：装配逻辑曾有三份内联实现（`scripts/build.mjs` 五层 LAYER_OF ·
 * `apps/showcase/server.ts` 与 `src/test/scenario/server.ts` 把全部文件塞进
 * `@layer layout`）+ 第四条管线（`ctx.ui.css` 直读 src 入口 → 零 @layer，靠
 * postcss/tailwind 顺带内联 @import）——**四种装配三种层序语义**：测试环境验证的
 * 层序 ≠ 发布产物层序。本模块是唯一实现，四处共用（Node 面：build 脚本 / dev server /
 * ui 中间件；不进浏览器 bundle）。
 *
 * **单源内容**：
 *   ① 文件顺序   = `weifuwu-layout.css` 的 `@import` 列表（源面即顺序面）
 *   ② 层归属     = `LAYER_OF`（未登记文件 → 抛错，不静默降级：`_flex` 掉层致
 *                  `wf-flex@lg` 失效的历史教训）
 *   ③ 层序声明   = `LAYER_ORDER`（**W1 修复**：旧 build 取 entry 首行当 head，产出
 *                  未闭合注释把 `@layer …;` 声明整条吞掉 → 层序退化为「块首现顺序」
 *                  ——声明面形同虚设，W2 改层序会是空操作；**W2 已改**：utilities 提到
 *                  components 之后 = 工具类可覆盖组件样式）
 *   ④ tokens 不包裹 = `:root`/`@supports` 顶层块被 `@layer` 包裹会产生冗余 `}`
 *                  （PostCSS `Unexpected }` → `/static/style.css` 500 的根因实证）
 *   ⑤ inputs      = 参与装配的全部文件绝对路径（消费侧新鲜度键——`ctx.ui.css`
 *                  旧实现只 stat 入口 → 改 `_tokens.css` 不失效 = 陈旧缓存）
 */
import { readFile, readdir } from 'node:fs/promises'
import { generateLayoutCss } from './define.ts'
import { structures } from './decl.ts'
import { join, resolve } from 'node:path'

/**
 * 层序（优先级从低到高——后声明者胜）
 *
 * **utilities 在 components 之后**（LAYOUT-PLAN W2）：工具类是消费侧的**显式覆盖**意图，
 * 必须能胜组件自身样式（Tailwind 惯例）。旧序（utilities 在 components 之前）下的实证：
 *   · `.wf-card--pad-lg + .wf-padding-xs` → 24px（工具类 4px 被吞）
 *   · `.wf-btn + .wf-hidden` → inline-flex（**隐藏失效**——agent-platform 面板按钮
 *     桌面隐藏不生效，当时靠 `wf-hidden\@lg { … !important }` 变通）
 * 层序声明必须是**活 atrule**（见文件头 ③：旧 build 的未闭合注释曾吞掉本声明 →
 * 优先级退化为块首现顺序，改层序会是空操作）。unlayered 应用 CSS 仍胜全部层（规范行为）。
 */
export const LAYER_ORDER = ['tokens', 'base', 'layout', 'components', 'utilities'] as const

/** 文件 → 层归属（未登记即抛错——静默降级 = 层叠优先级悄悄变化） */
export const LAYER_OF: Record<string, string> = {
  _tokens: 'tokens', _dark: 'tokens', _presets: 'tokens', _props: 'tokens', _base: 'base',
  _stack: 'layout', _row: 'layout', _split: 'layout', _center: 'layout', _justify: 'layout',
  _fill: 'layout', _grid: 'layout', _cluster: 'layout', _cover: 'layout',
  _position: 'layout', _sticky: 'layout', _overflow: 'layout', '_safe-area': 'layout',
  _layer: 'layout', '_align-self': 'layout', _nowrap: 'layout', _shrink: 'layout',
  _container: 'layout', '_app-shell': 'layout',
  _surface: 'utilities', _spacing: 'utilities', _border: 'utilities',
  _text: 'utilities', _hidden: 'utilities', _block: 'utilities',
  _flex: 'utilities', // display 工具族（基类 :where() 零优先级 + @media 变体正常优先级——变体恒胜基类，零 !important）
  _popup: 'layout', // 框架内部浮层基类（popup-manager 消费——非用户词汇）
}

/** 不参与类清单/包裹的 token 层文件（层序声明中占位——实际不包裹，见 ④） */
const TOKENS_LAYER = 'tokens'

export interface CssBundle {
  /** 装配后的完整 CSS（可直接作为 Response body / 写盘） */
  css: string
  /** 参与装配的文件绝对路径（新鲜度键——mtime+size 逐个校验） */
  inputs: string[]
}

const stripImports = (css: string): string => css.replace(/@import\s+['"][^'"]+['"]\s*;?\s*\n?/g, '')

/** entry 的 `@import` 顺序（源面即顺序面——单源①） */
export async function layoutEntryFiles(layoutDir: string): Promise<string[]> {
  const entry = await readFile(join(layoutDir, 'weifuwu-layout.css'), 'utf-8')
  const files: string[] = []
  for (const line of entry.split('\n')) {
    const m = line.match(/@import\s+['"]([^'"]+)['"]/)
    if (m) files.push(m[1].replace(/^\.\//, ''))
  }
  if (!files.length) throw new Error(`layout 入口无 @import（${layoutDir}/weifuwu-layout.css）——装配单源失效`)
  return files
}

/** 目录是否为 layout 源面（有 entry + 分量 `_*.css`——dist 只有合并产物 → false） */
export async function isLayoutSourceDir(dir: string): Promise<boolean> {
  try {
    const entries = await readdir(dir)
    return entries.includes('weifuwu-layout.css') && entries.some((f) => /^_[a-z-]+\.css$/.test(f))
  } catch {
    return false
  }
}

/**
 * 装配 layout CSS（Token + 暗色 + 预设 + 基础 + 原语 + 工具——按 LAYER_OF 分层）
 * @param layoutDir `src/client/layout` 绝对/相对路径
 */
export async function bundleLayout(layoutDir: string): Promise<CssBundle> {
  const dir = resolve(layoutDir)
  const files = await layoutEntryFiles(dir)
  const inputs: string[] = [join(dir, 'weifuwu-layout.css')]
  const chunks: string[] = []
  for (const f of files) {
    // **生成段（defineLayout——原语声明单源）**：row/stack 族由声明生成——
    // 手写 _row.css/_stack.css 已删（布局契约 layout-define 锁生成=手写等价）
    if (f === '_stack.css') {
      inputs.push(join(dir, 'decl.ts'), join(dir, 'define.ts'))
      chunks.push(`@layer ${LAYER_OF['_stack']} {\n${generateLayoutCss(structures)}\n}`)
      continue
    }
    if (f === '_row.css') continue // 已随 _stack 生成（声明含 row 族）
    const abs = join(dir, f)
    inputs.push(abs)
    const content = stripImports(await readFile(abs, 'utf-8')).trim()
    const name = f.replace(/\.css$/, '')
    const layer = LAYER_OF[name]
    if (!layer) {
      throw new Error(`layout 文件未登记 @layer 映射: ${f}（在 src/client/layout/bundle.ts LAYER_OF 中登记）`)
    }
    // tokens 层不包裹（:root/@supports 顶层块——包裹产生冗余 } → PostCSS Unexpected }）
    chunks.push(layer === TOKENS_LAYER ? content : `@layer ${layer} {\n${content}\n}`)
  }
  // 层序声明必须**在注释之外**（旧 build 的未闭合 head 注释吞掉本行——层序退化为块首现顺序）
  const css = `/* weifuwu/layout — CSS 布局原语 + 设计 Token（装配单源：src/client/layout/bundle.ts） */\n\n@layer ${LAYER_ORDER.join(', ')};\n\n${chunks.join('\n\n')}\n`
  return { css, inputs }
}

/**
 * 装配组件 CSS = layout 全量 + 全部组件 CSS（`@layer components`）
 * 组件目录动态扫描（新增组件自动包含——硬编码列表会静默漏 CSS）
 */
export async function bundleComponents(layoutDir: string, componentsDir: string): Promise<CssBundle> {
  const { css: layoutCss, inputs } = await bundleLayout(layoutDir)
  const dir = resolve(componentsDir)
  const dirs = (await readdir(dir, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name)
  let css = `${layoutCss}@layer components {\n`
  for (const name of dirs) {
    const abs = join(dir, name, `${name}.css`)
    try {
      css += `${await readFile(abs, 'utf-8')}\n`
      inputs.push(abs)
    } catch {
      // 组件无 CSS——跳过（合法：纯逻辑组件）
    }
  }
  css += '}\n'
  return { css, inputs }
}

/**
 * 类 → 层归属映射（契约用：跨管线层归属全等断言）
 *
 * 顶层 `@layer <name> { … }` 块内的 `.wf-*` 归该层（块内嵌套 @media/@supports 自然包含）；
 * 块外的类归 `unlayered`（tokens 层文件不包裹——但其内容零类，仅 :root 变量）。
 * 首现优先（同类多规则同层——跨管线比较只看归属，不看声明明细）。
 */
export function layerMapOf(css: string): Map<string, string> {
  const map = new Map<string, string>()
  const CLASS_RE = /\.wf-[a-z0-9]+(?:-[a-z0-9]+)*(?:--[a-z-]+)?/g
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '') // 注释内类名提及不算归属
  const collect = (text: string, layer: string): void => {
    for (const m of text.matchAll(CLASS_RE)) {
      const cls = m[0].slice(1)
      if (!map.has(cls)) map.set(cls, layer)
    }
  }
  let unlayered = ''
  let i = 0
  while (i < stripped.length) {
    const at = stripped.indexOf('@layer', i)
    if (at === -1) { unlayered += stripped.slice(i); break }
    const brace = stripped.indexOf('{', at)
    const semi = stripped.indexOf(';', at)
    // `@layer a, b, c;` 层序声明（无块）——不进归属
    if (semi !== -1 && (brace === -1 || semi < brace)) {
      unlayered += stripped.slice(i, semi + 1)
      i = semi + 1
      continue
    }
    if (brace === -1) { unlayered += stripped.slice(i); break }
    const name = stripped.slice(at + '@layer'.length, brace).trim()
    let depth = 0
    let j = brace
    for (; j < stripped.length; j++) {
      if (stripped[j] === '{') depth++
      else if (stripped[j] === '}') { depth--; if (depth === 0) { j++; break } }
    }
    unlayered += stripped.slice(i, at)
    collect(stripped.slice(brace + 1, j - 1), name)
    i = j
  }
  collect(unlayered, 'unlayered')
  return map
}
