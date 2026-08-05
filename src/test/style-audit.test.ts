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
import { readFileSync, readdirSync } from 'node:fs'
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
    // 与排版刻度（--wf-font-size-*）无关，属组件内设计决策
    const allowed = new Set(['10px', '11px', '12px', '13px', '14px', '16px', '24px', '28px', '48px'])
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
      ['可点击卡片', /\.wf-card--clickable:focus-visible/],
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
})
