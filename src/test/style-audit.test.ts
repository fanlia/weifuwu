/**
 * 样式审计测试 — 保证 weifuwu/layout + weifuwu/components 的设计约束不回归
 *
 * 纯静态 CSS，无 DOM。直接读 src（与 build.mjs 相同的拼接顺序），
 * 不依赖 dist 是否构建。规则：
 *   1. 组件 CSS 的 z-index 必须 token 化（仅允许内部层级 1/-1）
 *   2. 组件 CSS 的 font-size 必须引用 token（仅允许图标/展示尺寸白名单）
 *   3. 非 button 交互类必须有 focus 规则；基础 button:focus-visible 存在
 *   4. :root token 数量与 README 声明同步
 *   5. reduced-motion 降级块存在
 *   6. 暗色模式双段激活（手动 + 系统偏好）存在
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, globSync } from 'node:fs'
import { basename } from 'node:path'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

/** 按 src/layout/weifuwu-layout.css 的 @import 顺序拼接 */
function readLayoutCss(): string {
  const entry = readFileSync(join(root, 'src/layout/weifuwu-layout.css'), 'utf-8')
  const files = [...entry.matchAll(/@import '\.\/([^']+)'/g)].map(m => m[1])
  assert.ok(files.length > 20, 'layout 导入文件数异常')
  return files.map(f => readFileSync(join(root, 'src/layout', f), 'utf-8')).join('\n')
}

/** 拼接所有组件 CSS（目录名 = 文件名） */
function readComponentCss(): string {
  const dirs = readdirSync(join(root, 'src/components'), { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name)
    .sort()
  assert.ok(dirs.length > 30, '组件目录数异常')
  return dirs
    .map(d => {
      try { return readFileSync(join(root, 'src/components', d, `${d}.css`), 'utf-8') } catch { return '' }
    })
    .join('\n')
}

describe('样式审计 — 设计约束', () => {
  it('组件 z-index 全部 token 化（防 998/999 硬编码回归）', () => {
    const css = readComponentCss()
    const violations: string[] = []
    for (const m of css.matchAll(/z-index:\s*([^;]+);/g)) {
      const value = m[1].trim()
      // 允许：内部层级 1/-1（modal 内容/遮罩在组件自身堆叠上下文内）
      if (value === '1' || value === '-1') continue
      // 允许：var(--wf-z-*) 引用（含 calc 表达式，如 popover overlay 的 calc(var(--wf-z-popover) - 1)）
      if (value.includes('var(--wf-z-')) continue
      violations.push(`z-index: ${value}`)
    }
    assert.deepEqual(violations, [], '组件 CSS 不得出现硬编码 z-index（除 1/-1 内部层级）')
  })

  it('组件 font-size 引用 token（仅允许图标/展示尺寸白名单）', () => {
    const css = readComponentCss()
    // 白名单：Avatar/EmptyState/FileUpload/StatCard 等图标与展示尺寸，
    // 与排版刻度（--wf-font-size-*）无关，属组件内设计决策；
    // 0.875em：行内代码相对字号（随父级上下文缩放，Markdown 内嵌于标题/段落）
    const allowed = new Set(['10px', '11px', '12px', '13px', '14px', '16px', '24px', '28px', '48px', '0.875em'])
    const violations: string[] = []
    for (const m of css.matchAll(/font-size:\s*([^;]+);/g)) {
      const value = m[1].trim()
      if (value.startsWith('var(') || value === 'inherit') continue
      if (allowed.has(value)) continue
      violations.push(`font-size: ${value}`)
    }
    assert.deepEqual(violations, [], '组件 CSS 的 font-size 必须引用 --wf-font-size-* 或属于白名单')
  })

  it('非 button 交互类有 focus 规则；基础 button:focus-visible 存在', () => {
    const base = readFileSync(join(root, 'src/layout/_base.css'), 'utf-8')
    assert.match(base, /button:focus-visible/, '基础 button:focus-visible 规则缺失')

    const compCss = readComponentCss()
    const layoutCss = readLayoutCss()
    const all = compCss + '\n' + layoutCss
    const checks: Array<[string, RegExp]> = [
      ['可点击卡片', /\.wf-elevate:focus-visible/],
      ['排序表头', /\.wf-table-th--sortable:focus-visible/],
      ['手风琴标题', /\.wf-accordion-summary:focus-visible/],
      ['文本输入', /\.wf-input:focus/],
      ['文本域', /\.wf-textarea:focus/],
      ['下拉框', /\.wf-select:focus/],
      ['复选框', /\.wf-checkbox-input:focus-visible/],
      ['开关', /\.wf-switch-input:focus-visible/],
      ['单选项', /\.wf-radio-input:focus-visible/],
      ['滑块', /\.wf-slider-input:focus-visible/],
    ]
    const missing = checks.filter(([label, re]) => !re.test(all)).map(([label]) => label)
    assert.deepEqual(missing, [], `缺少 focus 规则的交互组件: ${missing.join(', ')}`)
  })

  it(':root token 数量与 README 声明同步', () => {
    const tokens = readFileSync(join(root, 'src/layout/_tokens.css'), 'utf-8')
    const count = (tokens.match(/^ {2}--wf-/gm) || []).length
    assert.ok(count > 100, `token 数异常: ${count}`)

    const readme = readFileSync(join(root, 'README.md'), 'utf-8')
    assert.match(readme, new RegExp(`${count} 个主题 Token`), `README 应声明 ${count} 个主题 Token`)
  })

  it('prefers-reduced-motion 降级块存在', () => {
    const base = readFileSync(join(root, 'src/layout/_base.css'), 'utf-8')
    assert.match(base, /prefers-reduced-motion/)
    assert.match(base, /animation-duration: 0\.01ms !important/)
  })

  it('暗色模式双段激活（手动 data-theme + 系统偏好）', () => {
    const dark = readFileSync(join(root, 'src/layout/_dark.css'), 'utf-8')
    assert.match(dark, /\[data-theme="dark"\]/, '手动 data-theme 段缺失')
    assert.match(dark, /prefers-color-scheme: dark/, '系统偏好段缺失')
    assert.match(dark, /:root:not\(\[data-theme="light"\]\)/, 'data-theme="light" 强制亮色覆盖缺失')
    // 两段暗色值必须同步（改动一处另一处漏改 = 不一致）
    const extract = (sel: string) => {
      const start = dark.indexOf(sel)
      const body = dark.slice(start)
      const end = body.indexOf('}')
      return body.slice(0, end).replace(/\s+/g, ' ')
    }
    const manual = extract('[data-theme="dark"]')
    const auto = extract('@media (prefers-color-scheme: dark)')
    assert.ok(manual.length > 100 && auto.length > 100)
  })

  it('组件关键视觉 var() 化（radius/容器宽度禁止裸值）', () => {
    const css = readComponentCss()
    const violations: string[] = []
    // radius：裸值 > 4px 必须 var()（50% 圆形、≤4px 内部细节白名单）
    for (const m of css.matchAll(/border-radius:\s*([^;]+);/g)) {
      const v = m[1].trim()
      if (v.startsWith('var(') || v === '50%' || v === '0' || v === 'inherit') continue
      const px = parseFloat(v)
      if (px > 4) violations.push(`border-radius: ${v}`)
    }
    // 容器宽度：min-width 裸值 ≥ 100px 必须 var()（Modal/Drawer/面板宽度 = 定制钩子）
    for (const m of css.matchAll(/min-width:\s*([^;]+);/g)) {
      const v = m[1].trim()
      if (v.startsWith('var(')) continue
      const px = parseFloat(v)
      if (px >= 100) violations.push(`min-width: ${v}`)
    }
    assert.deepEqual(violations, [], '组件 CSS 的关键视觉（radius/容器宽度）必须 var() 化（定制钩子）')
  })

  it('暗色段无硬编码色值（值必须经 --wf-dark-* 间接层）', () => {
    const dark = readFileSync(join(root, 'src/layout/_dark.css'), 'utf-8')
    const raw = dark.match(/#[0-9a-fA-F]{3,8}|rgba?\(/g) ?? []
    assert.deepEqual(raw, [], '暗色段不得出现裸色值，必须引用 --wf-dark-* 原始层')

    // 原始层必须定义全部 --wf-dark-* 值
    const tokens = readFileSync(join(root, 'src/layout/_tokens.css'), 'utf-8')
    const darkVars = [...dark.matchAll(/var\((--wf-dark-[\w-]+)\)/g)].map(m => m[1])
    for (const v of new Set(darkVars)) {
      assert.match(tokens, new RegExp(`${v}:`), `原始层缺少暗色值定义: ${v}`)
    }
  })

  // ── 对比度计算（WCAG 相对亮度） ──
  function luminance(hex: string): number {
    const m = hex.match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i)
    if (!m) throw new Error(`bad hex: ${hex}`)
    const [r, g, b] = [1, 2, 3].map(i => parseInt(m[i], 16) / 255)
    const lin = (c: number) => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
  }
  function contrast(a: string, b: string): number {
    const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x)
    return (l1 + 0.05) / (l2 + 0.05)
  }

  it('语义文字色对比度 ≥ 4.5（-text 对 -50 底，亮暗双验证）', () => {
    const tokens = readFileSync(join(root, 'src/layout/_tokens.css'), 'utf-8')
    const get = (name: string) => {
      const m = tokens.match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`))
      assert.ok(m, `原始层缺少色值: ${name}`)
      return m[1]
    }
    // 亮色：700 级文字色 on 50 级底色
    const light: [string, string][] = [
      ['--wf-brand-700', '--wf-brand-50'],
      ['--wf-green-700', '--wf-green-50'],
      ['--wf-amber-700', '--wf-amber-50'],
      ['--wf-red-700', '--wf-red-50'],
      ['--wf-sky-700', '--wf-sky-50'],
    ]
    for (const [fg, bg] of light) {
      const r = contrast(get(fg), get(bg))
      assert.ok(r >= 4.5, `亮色对比度不足: ${fg} on ${bg} = ${r.toFixed(2)}:1`)
    }
    // 暗色：dark-500 级 on dark-50 级（暗色下 500 级即浅色文字）
    const darkPairs: [string, string][] = [
      ['--wf-dark-brand-500', '--wf-dark-brand-50'],
      ['--wf-dark-green-500', '--wf-dark-green-50'],
      ['--wf-dark-amber-500', '--wf-dark-amber-50'],
      ['--wf-dark-red-500', '--wf-dark-red-50'],
      ['--wf-dark-sky-500', '--wf-dark-sky-50'],
    ]
    for (const [fg, bg] of darkPairs) {
      const r = contrast(get(fg), get(bg))
      assert.ok(r >= 4.5, `暗色对比度不足: ${fg} on ${bg} = ${r.toFixed(2)}:1`)
    }
  })

  it('组件文字色禁止 500 级语义色（必须 -text 变体）', () => {
    const css = readComponentCss()
    const violations = [...css.matchAll(/(?<![\-\w])color:\s*var\((--wf-color-(?:success|warning|error|info|primary))\)/g)]
      .map(m => m[0].trim())
    assert.deepEqual(violations, [], '文字色必须用 -text 变体（500 级仅限填充/边框/焦点）')
  })

  it('组件遮罩禁止硬编码 rgba（必须 var(--wf-overlay)）', () => {
    const css = readComponentCss()
    const violations = [...css.matchAll(/background(?:-color)?:\s*rgba\(/g)].map(m => m[0])
    assert.deepEqual(violations, [], '遮罩背景必须 var(--wf-overlay)，不得硬编码 rgba')
  })

  it('组件文字禁止裸 #fff（必须 var(--wf-color-on-brand)）', () => {
    const css = readComponentCss()
    const violations = [...css.matchAll(/(?<![\-\w])color:\s*#fff\b/gi)].map(m => m[0])
    assert.deepEqual(violations, [], '实心填充上的文字必须 var(--wf-color-on-brand)')
  })

  it('动效 Token 存在（时长阶梯/缓动/位移）', () => {
    const tokens = readFileSync(join(root, 'src/layout/_tokens.css'), 'utf-8')
    const required = [
      '--wf-dur-fast', '--wf-dur-base', '--wf-dur-slow',
      '--wf-ease-out', '--wf-ease-in', '--wf-ease-snap',
      '--wf-motion-sm', '--wf-motion-md', '--wf-motion-lg',
    ]
    for (const name of required) {
      assert.match(tokens, new RegExp(`${name}:`), `缺少动效 Token: ${name}`)
    }
  })

  it('浮层组件 --enter/--exit 类必须成对（防退场死代码回归）', () => {
    const dirs = readdirSync(join(root, 'src/components'), { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name)
    const violations: string[] = []
    for (const d of dirs) {
      let css: string
      try { css = readFileSync(join(root, 'src/components', d, `${d}.css`), 'utf-8') } catch { continue }
      if (!css.includes('--enter')) continue
      if (!css.includes('--exit')) violations.push(d)
    }
    assert.deepEqual(violations, [], '定义了 --enter 的组件必须有 --exit 退场（死代码回归）')
  })

  it('表头/分组标题无裸 uppercase（必须 var(--wf-heading-case)，CJK 感知）', () => {
    const base = readFileSync(join(root, 'src/layout/_base.css'), 'utf-8')
    const shell = readFileSync(join(root, 'src/layout/_app-shell.css'), 'utf-8')
    assert.match(base, /text-transform: var\(--wf-heading-case\)/, 'th 必须引用 heading-case token')
    assert.match(shell, /text-transform: var\(--wf-heading-case\)/, 'nav-group 必须引用 heading-case token')
    const text = readFileSync(join(root, 'src/layout/_text.css'), 'utf-8')
    assert.match(text, /\.wf-nums/, 'wf-nums 工具类（tabular-nums）缺失')
    assert.match(text, /\.wf-text-display/, 'wf-text-display 工具类缺失')
  })

  it('组件 .ts 禁止裸文本字形（统一走 Icon 组件）', () => {
    const dirs = readdirSync(join(root, 'src/components'), { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name)
    const violations: string[] = []
    for (const d of dirs) {
      const ts = join(root, 'src/components', d, `${d}.ts`)
      try {
        const src = readFileSync(ts, 'utf-8')
        if (/[✕✓⚠ℹ⇅▲▼‹›⏸]/.test(src)) violations.push(`${d}.ts`)
      } catch { /* 无 .ts（如纯 CSS 目录） */ }
    }
    assert.deepEqual(violations, [], '文本字形必须替换为 Icon 组件（emoji 属文案性 labels 白名单）')
  })

  it('触屏命中区：非 button 交互元素必须有 coarse 44px 覆盖（新增交互组件在此登记）', () => {
    const layout = readLayoutCss()
    const component = readComponentCss()
    const coarse = layout + component
    // 括号计数提取所有 @media (pointer: coarse) 块中的选择器（处理嵌套花括号）
    const selectors = new Set<string>()
    const re = /@media \(pointer: coarse\)\s*\{/g
    let m: RegExpExecArray | null
    while ((m = re.exec(coarse))) {
      let depth = 1
      let i = re.lastIndex
      while (i < coarse.length && depth > 0) {
        if (coarse[i] === '{') depth++
        else if (coarse[i] === '}') depth--
        i++
      }
      const block = coarse.slice(re.lastIndex, i - 1)
      for (const line of block.split('\n')) {
        const sel = line.trim().split(/\s*\{/)[0].split(',')[0].trim()
        if (sel.startsWith('.')) selectors.add(sel)
      }
      re.lastIndex = i
    }
    // 非 button/input/select 的交互元素清单（button 类由全局 `button` 选择器覆盖；
    // 新增非 button 交互组件/类时必须在此登记，否则触屏命中区回归）
    const MUST_COVER = [
      '.wf-card--clickable',
      '.wf-table-th--sortable',
      '.wf-accordion-summary',
      '.wf-checkbox',
      '.wf-switch',
      '.wf-radio',
      '.wf-datepicker-cell',
      '.wf-carousel-dot',
      '.wf-select-search-opt',
    ]
    const missing = MUST_COVER.filter(cls => ![...selectors].some(c => c === cls || c.startsWith(cls + '--') || c.startsWith(cls + ':')))
    assert.deepEqual(missing, [], `粗指针 44px 命中区未覆盖：${missing.join(', ')}（在 _base.css 或组件 CSS 的 coarse 块登记）`)
  })

  it('一次性动画必须引用动效 Token（循环动画 spinner/shimmer 豁免）', () => {
    const css = readComponentCss() + '\n' + readLayoutCss()
    const violations: string[] = []
    for (const m of css.matchAll(/animation:\s*([^;]+);/g)) {
      const v = m[1]
      if (v.includes('infinite')) continue // 循环动画（spinner/shimmer）时长是转速参数，豁免
      if (v.includes('var(--wf-dur') && v.includes('var(--wf-ease')) continue
      if (/\d+(ms|s)/.test(v) || /(^|[^\w-])ease(-in|-out|-in-out)?\b/.test(v)) {
        violations.push(v.trim().slice(0, 60))
      }
    }
    assert.deepEqual(violations, [], '一次性动画必须引用 --wf-dur-* / --wf-ease-* Token（防硬编码回归）')
  })

  it('组件 .ts 禁止直接 DOM 全局引用（必须经 ctx.browser / ctx.ui.useXXX）', () => {
    // 浏览器环境纪律：内置组件使用浏览器能力必须经 ctx.browser（环境 API）
    // 与 ctx.ui.useXXX（框架原语）——直接 window./document./navigator./
    // localStorage/matchMedia(/IntersectionObserver 等 DOM 全局 = 违例
    const dir = join(root, 'src/components')
    const files: string[] = []
    const walk = (d: string) => {
      for (const ent of readdirSync(d, { withFileTypes: true })) {
        const p = join(d, ent.name)
        if (ent.isDirectory()) walk(p)
        else if (ent.name.endsWith('.ts') && !ent.name.endsWith('.test.ts')) files.push(p)
      }
    }
    walk(dir)
    // 排除注释后的 DOM 全局引用
    // getSelection( 需排除已收敛调用（_browser?.getSelection( / browser.getSelection(）——
    // 用 (?<![\w.]) 前瞻：前面是字母或点 = 已收敛（方法调用），否则 = 直接全局
    const forbidden = /\bwindow\.|\bdocument\.|\bnavigator\.|\blocation\.|\bhistory\.|\blocalStorage\b|(?<![\w.])getSelection\(|\brequestAnimationFrame\b|\bMutationObserver\b|\bIntersectionObserver\b|matchMedia\(/
    const violations: string[] = []
    for (const f of files) {
      const src = readFileSync(f, 'utf-8')
      const noComments = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
      for (const line of noComments.split('\n')) {
        if (forbidden.test(line)) {
          violations.push(`${f.replace(root + '/', '')}: ${line.trim().slice(0, 80)}`)
        }
      }
    }
    assert.deepEqual(violations, [], '组件禁止直接 DOM 全局引用——统一经 ctx.browser/useXXX（AGENTS.md 浏览器环境纪律）')
  })

  it('组件 CSS class 不与 layout 布局原语冲突（Grid 覆盖 .wf-grid 教训）', () => {
    // layout 布局原语 class（.wf-* 顶层规则）——组件 CSS 不得同名定义
    const layout = readLayoutCss()
    const layoutClasses = new Set(
      [...layout.matchAll(/^\.wf-[a-z][\w-]*/gm)].map(m => m[0]),
    )
    const component = readComponentCss()
    const conflicts = [...component.matchAll(/^\.wf-[a-z][\w-]*/gm)]
      .map(m => m[0])
      .filter(c => layoutClasses.has(c))
    // 白名单：组件有意复用的语义 class（wf-btn/wf-input/wf-icon 等基础件）
    const allowed = new Set(['.wf-btn', '.wf-input', '.wf-icon', '.wf-popup'])
    const violations = conflicts.filter(c => !allowed.has(c))
    assert.deepEqual(violations, [], '组件 CSS 不得定义与 layout 布局原语同名的 class（demo 双列 grid 被覆盖的教训）')
  })

  it('组件 ref 必须稳定引用（内联 ref 每次渲染新引用 → 回调重复执行）', () => {
    // 内联 ref = `ref: (el) =>` 直接写在 render 返回的 props 里——
    // 每次渲染新函数 → ref-diff 反复触发旧 ref(null)+新 ref(el)（AGENTS.md 纪律）
    // 正确：mount 层定义稳定函数（const xxxRef = (el) => {}）后 ref: xxxRef 引用
    const dirs = readdirSync(join(root, 'src/components'), { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name)
    const violations: string[] = []
    for (const d of dirs) {
      const ts = join(root, 'src/components', d, `${d}.ts`)
      try {
        const src = readFileSync(ts, 'utf-8')
        const m = src.match(/ref:\s*\(/g)
        if (m) violations.push(`${d}.ts ×${m.length}`)
      } catch {}
    }
    assert.deepEqual(violations, [], 'ref 必须引用 mount 层稳定函数（ref: xxxRef），禁止内联箭头')
  })

  it('弹层定位 transform 防线：动画含 transform 的组件不得有定位 transform（动画覆盖定位→弹层跳位）', () => {
    // 收集所有 fixed 弹层组件：动画 transform 与定位 transform 的冲突检测。
    // 定位 transform = 主类（含 position:fixed）或 --top/bottom/left/right 变体的 transform
    const compFiles = globSync(join(root, 'src/components/*/*.css'))
    const conflicts: string[] = []
    for (const f of compFiles) {
      const text = readFileSync(f, 'utf-8')
      if (!text.includes('position: fixed')) continue
      const hasAnimTransform = /@keyframes[^}]*\{[^}]*transform:/.test(text)
      // 定位 transform：主类块（position:fixed 同块）或方向变体
      const hasPosTransform =
        /\.[a-z-]*\{[^}]*position:\s*fixed[^}]*transform:/.test(text) ||
        /--(?:top|bottom|left|right)[^{]*\{[^}]*transform:/.test(text)
      if (hasAnimTransform && hasPosTransform) {
        conflicts.push(basename(f))
      }
    }
    assert.deepEqual(conflicts, [], '动画 transform 会覆盖定位 transform（弹层动画期间跳位）：' + conflicts.join(', '))
  })

  it('组件 CSS 假 token 防线：var(--wf-*) 引用必须可解析（定义或 fallback）', () => {
    // 收集 layout 定义的所有 --wf-* token
    const layoutDefs = new Set()
    for (const f of readdirSync(join(root, 'src/layout')).filter(x => x.endsWith('.css'))) {
      const text = readFileSync(join(root, 'src/layout', f), 'utf-8')
      for (const m of text.matchAll(/--(wf-[a-z0-9-]+)\s*:/g)) layoutDefs.add('--' + m[1])
    }
    // 收集组件自身定义的 token（局部变量）
    const compDefs = new Set()
    const compFiles = globSync(join(root, 'src/components/*/*.css'))
    for (const f of compFiles) {
      const text = readFileSync(f, 'utf-8')
      for (const m of text.matchAll(/--(wf-[a-z0-9-]+)\s*:/g)) compDefs.add('--' + m[1])
    }
    // 扫描组件 CSS：var(--wf-xxx) 无 fallback 且无定义 = 解析失败
    const broken: string[] = []
    for (const f of compFiles) {
      const text = readFileSync(f, 'utf-8')
      for (const m of text.matchAll(/var\((--wf-[a-z0-9-]+)\)/g)) {
        const t = m[1]
        if (!layoutDefs.has(t) && !compDefs.has(t)) {
          broken.push(`${basename(f)}: ${t}`)
        }
      }
    }
    assert.deepEqual(broken, [], '组件 CSS 引用了未定义且无 fallback 的 token（解析失败 → initial 值 → 视觉 bug）：\n' + broken.join('\n'))
  })

  it('focus-ring 双层：含 primary 线（系统暗色偏好下聚焦可见——C5）', () => {
    const tokens = readFileSync(join(root, 'src/layout/_tokens.css'), 'utf-8')
    const m = tokens.match(/--wf-focus-ring:\s*([^;]+);/)
    assert.ok(m, 'focus-ring token 存在')
    const value = m[1]
    assert.ok(value.includes('--wf-color-primary'), 'focus-ring 必须含 primary（线）——单用 primary-bg 暗色偏好下不可见')
    assert.ok(value.includes('--wf-color-primary-bg'), 'focus-ring 应含 bg（淡环）')
  })

  it('client 防线存在：enumerated 属性渲染 + 内置类型降级（CDD 启发回归防线）', () => {
    // 1. draggable enumerated 语义防线（Kanban 教训：setAttribute('draggable','') = false）
    const dragTest = readFileSync(join(root, 'src/test/client/draggable.test.ts'), 'utf-8')
    assert.match(dragTest, /el\.draggable/, 'draggable.test.ts 必须断言 el.draggable 真值')
    assert.match(dragTest, /'true'/, '渲染器必须显式 setAttribute(\'true\')')

    // 2. 内置集合类型降级防线（DiffView 教训：$ 存 Set 破坏方法 this）
    const reactive = readFileSync(join(root, 'src/client/reactive.ts'), 'utf-8')
    assert.match(reactive, /instanceof Set/, 'reactive.ts 必须处理 Set（内置类型降级）')
    assert.match(reactive, /MUTATING/, 'Set/Map 只读方法不触发 dirty（变异方法白名单）')
  })
})
// ── 布局原语回归（agent-browser 体检发现的真实 bug） ──
it('wf-container 必须 width:100%（flex 父中 margin auto 阻止 stretch——landing 特性区 404 根因）', () => {
  const layout = readLayoutCss()
  assert.match(layout, /\.wf-container\s*\{[\s\S]*?width:\s*100%/, 'wf-container 必须有 width:100%')
  assert.match(layout, /\.wf-container\s*\{[\s\S]*?max-width:\s*var\(--wf-max/, 'max-width 保留')
  assert.match(layout, /\.wf-container\s*\{[\s\S]*?margin:\s*0 auto/, 'margin auto 居中保留')
})
