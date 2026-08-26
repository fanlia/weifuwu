#!/usr/bin/env node
/**
 * weifuwu 样式审计（design/style-professional-plan.md §3——防回潮红线）
 *
 * 消费方：src/test/contract/style-audit.test.ts（契约层断言）+ CLI 手动运行。
 * 规则：
 *   S1 组件 CSS 零色值字面量（hex/rgb/rgba/hsl/oklch——含 var() 回退值）
 *   S2 组件 CSS 的 var(--wf-*) 必须存在于 layout 定义集（组件钩子 token 例外：
 *       var(--wf-<组件名前缀>-*) 声明在自身文件 = 合法定制钩子）
 *   S3 表头/分组标题不硬编码 text-transform/letter-spacing（必须引用 --wf-heading-*）
 *   S4 交互态链扫描（有 :hover 无 :active → warn；button 元素无 :focus → warn）
 *   S5 动效时长零裸秒/毫秒（transition/animation 值必须走 var(--wf-dur-*)/--wf-dur-spin）
 *   S6 硬编码字号（font-size: Npx——警告级：图标字形/头像/徽标白名单 12 处——
 *       登记控制不新增；正文类字号必须 token 化（compact 预设可缩放））
 *   S7 注释正确性（layout + components：注释内不得含星号加斜杠——提前闭合吞声明——
 *       --wf-transition-duration 吞声明实修实证）
 *
 * 用法：
 *   node scripts/style-audit.mjs            # 摘要（错误 → 退出码 1）
 *   node scripts/style-audit.mjs --json     # 完整结果
 */

import { readdirSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const LAYOUT_DIR = join(root, 'src/client/layout')
const COMP_DIR = join(root, 'src/client/components')

const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '')

/** S2 组件钩子前缀别名（dirname → 钩子前缀——kebab 归一后前缀匹配） */
const HOOK_PREFIX_ALIAS = { button: 'btn' }
const stripDash = (s) => s.replace(/-/g, '')

/** 组件钩子判定：var(--wf-<组件名前缀>-*) 以自身组件名开头（去连字符比较） */
function isComponentHook(name, dirName) {
  const prefix = HOOK_PREFIX_ALIAS[dirName] ?? dirName
  const n = stripDash(name.slice('--wf-'.length)) // 去掉 --wf- 前缀后比较
  const p = stripDash(prefix)
  return n === p || n.startsWith(p)
}


/** layout 层定义的全部 --wf-* 名（tokens/dark/presets/base + 原语/工具） */
export function definedTokens() {
  const names = new Set()
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name)
      if (e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules') walk(p)
      else if (e.isFile() && e.name.endsWith('.css')) {
        const css = stripComments(readFileSync(p, 'utf-8'))
        for (const m of css.matchAll(/--wf-[a-z0-9-]+/g)) names.add(m[0])
      }
    }
  }
  walk(LAYOUT_DIR)
  return names
}

/** 组件文件清单（含嵌套目录——dir/dir.css 主文件 + 子目录 css） */
function componentCssFiles() {
  return walkCss(COMP_DIR)
}

/** 递归收集目录下全部 .css */
function walkCss(dir) {
  const files = []
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name)
      if (e.isDirectory() && !e.name.startsWith('.')) walk(p)
      else if (e.isFile() && e.name.endsWith('.css')) files.push(p)
    }
  }
  walk(dir)
  return files
}

/** S4 可交互样式族启发匹配（button 元素/role=button/…-item/-close/-trigger/-btn/-opt） */
const INTERACTIVE_RE = /(button|\[role=["']button["']\]|\.wf-[a-z0-9-]+(?:--[a-z0-9-]+)?(?:-(?:item|close|trigger|btn|opt|step|tab|node|crumb|swatch|dot|page|cell|tag|icon|row|col|slider|thumb|handle|link|chip|entry|head|title|toggle|switch|radio|check|menu|option|action|card|btn)))/

export function audit() {
  const defined = definedTokens()
  const errors = []
  const warnings = []
  const perFile = []
  const files = componentCssFiles()

  // ── S7 注释正确性（全部 CSS——layout + components——注释内 */ 提前闭合吞声明） ──
  {
    const allCss = [...files, ...walkCss(LAYOUT_DIR)]
    for (const file of allCss) {
      const cssRaw = readFileSync(file, 'utf-8')
      const stripped = stripComments(cssRaw)
      const leftover = (stripped.match(/\*\//g) || []).length
      if (leftover) errors.push(`${file.replace(root + '/', '')}: S7 注释提前闭合（注释内出现 */——残留 ${leftover} 个）`)
    }
  }

  for (const file of files) {
    const dirName = dirname(file).split('/').pop().toLowerCase()
    const cssRaw = readFileSync(file, 'utf-8')
    const css = stripComments(cssRaw)
    const errorsF = []
    const warningsF = []
    const rel = file.replace(COMP_DIR + '/', '')

    // ── S1 色值字面量（含 var 回退） ──
    {
      const re = /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)|oklch?\([^)]*\)/g
      for (const m of css.matchAll(re)) {
        errorsF.push(`S1 色值字面量 ${m[0]}（必须引用语义 token）`)
      }
    }

    // ── S2 未知 var(--wf-*)（组件钩子例外：--wf-<组件名前缀>-* 声明在自身文件） ──
    {
      const re = /var\((--wf-[a-z0-9-]+)/g
      for (const m of css.matchAll(re)) {
        const name = m[1]
        if (defined.has(name)) continue
        // 钩子判定：以自身组件名开头（kebab 归一）——定制钩子是合法契约
        const isHook = isComponentHook(name, dirName)
        if (!isHook) {
          errorsF.push(`S2 未定义 token ${name}（layout 无此变量；组件钩子须以 "wf-${dirName}-" 开头）`)
        }
      }
    }

    // ── S3 表头/分组标题硬编码 ──
    {
      const txtRe = /text-transform:\s*(uppercase|lowercase|capitalize)\s*;/g
      const lsRe = /letter-spacing:\s*([^;]*);/g
      for (const m of css.matchAll(txtRe)) {
        errorsF.push(`S3 text-transform 硬编码 ${m[1]}（须引用 var(--wf-heading-case)——CJK 感知）`)
      }
      for (const m of css.matchAll(lsRe)) {
        const v = m[1].trim()
        if (v && !v.startsWith('var(')) {
          errorsF.push(`S3 letter-spacing 硬编码 ${v}（须引用 var(--wf-heading-tracking)/var(--wf-heading-display-tracking)）`)
        }
      }
    }

    // ── S5 动效时长字面量（先剥 var() 再查裸时长——0.6s 旋转须用 --wf-dur-spin） ──
    {
      const re = /(transition|animation)[^:]*:\s*([^;]*);/g
      for (const m of css.matchAll(re)) {
        const value = m[2].replace(/var\([^)]*\)/g, '')
        const dur = value.match(/(\d+(?:\.\d+)?(?:ms|s))/g)
        if (dur) {
          errorsF.push(`S5 动效时长字面量 ${dur.join('/')}（须引用 var(--wf-dur-*)/var(--wf-dur-spin)）`)
        }
      }
    }

    // ── S4 交互态链（warn——全局 button 反馈在 _base.css，组件只需补特殊元素） ──
    {
      const hasHover = /:hover/.test(css)
      const hasActive = /:active|--pressed|:pressed/.test(css)
      const hasFocus = /:focus(?:-visible)?/.test(css)
      if (hasHover && !hasActive && INTERACTIVE_RE.test(css)) {
        warningsF.push('S4 有 :hover 无 pressed 反馈（:active 缺失——列表项/按钮族）')
      }
      if (hasHover && !hasFocus && INTERACTIVE_RE.test(css)) {
        warningsF.push('S4 有 :hover 无 focus 反馈（:focus-visible 缺失——键盘可达性）')
      }
    }

    // ── S6 硬编码字号（warn——登记制：图标/头像/徽标白名单，正文必须 token 化） ──
    {
      const re = /font-size:\s*(\d+)px\s*;/g
      for (const m of css.matchAll(re)) {
        warningsF.push(`S6 硬编码字号 ${m[1]}px（正文类须 token 化——compact 预设可缩放；图标/头像/徽标类登记）`)
      }
    }

    if (errorsF.length || warningsF.length) {
      perFile.push({ file: rel, errors: errorsF, warnings: warningsF })
    }
    errors.push(...errorsF.map((e) => `${rel}: ${e}`))
    warnings.push(...warningsF.map((w) => `${rel}: ${w}`))
  }

  return { errors, warnings, files: files.length, perFile }
}

// ── CLI ──
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const res = audit()
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(res, null, 2))
  } else {
    console.log(`组件 CSS 文件: ${res.files}`)
    console.log(`S 规则错误: ${res.errors.length}${res.errors.length ? '\n' + res.errors.map((e) => '  ✗ ' + e).join('\n') : ''}`)
    console.log(`S 规则警告: ${res.warnings.length}${res.warnings.length ? '\n' + res.warnings.map((w) => '  ⚠ ' + w).join('\n') : ''}`)
    if (res.errors.length) process.exit(1)
  }
}
