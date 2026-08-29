/**
 * Math — 轻量公式渲染（自研 LaTeX 子集——不引 KaTeX，零依赖）
 *
 * 支持子集：上下标（x^2, x_1）、分数（\frac{a}{b}）、根号（\sqrt{x}）、
 * 希腊字母（\alpha \beta \pi）、求和（\sum_{i=1}^{n}）
 * 裁剪边界（design/components-cuts.md）：完整 LaTeX 引擎是独立项目——
 * 本组件覆盖教学/文档场景 80% 公式；复杂排版（矩阵/多行对齐）不渲染（诚实渲染原文）。
 */
import type { Component } from '../../vdom/index.ts'
import { h } from '../../vdom/index.ts'

export interface MathProps {
  /** LaTeX 公式（如 'x^2 + \\frac{1}{2}'） */
  tex: string
  className?: string
}

const GREEK: Record<string, string> = {
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε',
  theta: 'θ', lambda: 'λ', mu: 'μ', pi: 'π', sigma: 'σ',
  phi: 'φ', omega: 'ω', tau: 'τ', eta: 'η', rho: 'ρ',
  Delta: 'Δ', Sigma: 'Σ', Pi: 'Π', Omega: 'Ω',
}

interface Token {
  type: 'text' | 'sup' | 'sub' | 'frac' | 'sqrt' | 'greek' | 'sum'
  value: string
  num?: string
  den?: string
  index?: string
}

/** 轻量解析：递归下降（子集）——不可解析时原样输出（诚实裁剪） */
function parse(tex: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  const readGroup = (): string => {
    if (tex[i] === '{') {
      let depth = 1
      let out = ''
      i++
      while (i < tex.length && depth > 0) {
        if (tex[i] === '{') depth++
        if (tex[i] === '}') { depth--; if (depth === 0) { i++; break } }
        out += tex[i]
        i++
      }
      return out
    }
    // 单字符
    const ch = tex[i] ?? ''
    i++
    return ch
  }
  while (i < tex.length) {
    const ch = tex[i]
    if (ch === '^') { i++; tokens.push({ type: 'sup', value: readGroup() }); continue }
    if (ch === '_') { i++; tokens.push({ type: 'sub', value: readGroup() }); continue }
    if (ch === '\\') {
      const start = i
      i++
      let cmd = ''
      while (i < tex.length && /[a-zA-Z]/.test(tex[i])) { cmd += tex[i]; i++ }
      if (cmd === 'frac') {
        const num = readGroup()
        const den = readGroup()
        tokens.push({ type: 'frac', value: '', num, den })
        continue
      }
      if (cmd === 'sqrt') {
        tokens.push({ type: 'sqrt', value: readGroup() })
        continue
      }
      if (cmd === 'sum') {
        i++ // skip _ 
        let index = ''
        if (tex[i] === '_') { i++; index = readGroup() }
        tokens.push({ type: 'sum', value: '', index })
        continue
      }
      if (GREEK[cmd]) { tokens.push({ type: 'greek', value: GREEK[cmd] }); continue }
      // 未知命令——原样（诚实裁剪）
      tokens.push({ type: 'text', value: tex.slice(start, i) })
      continue
    }
    if (ch === '{' || ch === '}') { i++; continue }
    tokens.push({ type: 'text', value: ch })
    i++
  }
  return tokens
}

const renderToken = (t: Token): any => {
  switch (t.type) {
    case 'sup': return h('sup', { class: 'wf-math-sup' }, renderInline(parse(t.value)))
    case 'sub': return h('sub', { class: 'wf-math-sub' }, renderInline(parse(t.value)))
    case 'greek': return t.value
    case 'frac':
      return h('span', { class: 'wf-math-frac' }, [
        h('span', { class: 'wf-math-num' }, renderInline(parse(t.num ?? ''))),
        h('span', { class: 'wf-math-den' }, renderInline(parse(t.den ?? ''))),
      ])
    case 'sqrt':
      return h('span', { class: 'wf-math-sqrt' }, [
        h('span', { class: 'wf-math-sqrt-radical' }, '√'),
        h('span', { class: 'wf-math-sqrt-body', style: { borderTop: '1px solid currentColor' } }, renderInline(parse(t.value))),
      ])
    case 'sum':
      return h('span', { class: 'wf-math-sum' }, [
        h('span', { class: 'wf-math-sum-symbol' }, 'Σ'),
        t.index ? h('sub', { class: 'wf-math-sub' }, renderInline(parse(t.index))) : null,
      ])
    default: return t.value
  }
}

function renderInline(tokens: Token[]): any[] {
  return tokens.map((t, i) => h('span', { key: i, class: 'wf-math-token' }, renderToken(t)))
}

export const Math: Component<MathProps> = (_init: any) =>
  (props) => {
    const { tex, className = '' } = props
    return h('span', { class: `wf-math${className ? ` ${className}` : ''}`, style: { fontFamily: 'var(--wf-font-mono)', whiteSpace: 'nowrap' } }, renderInline(parse(tex)))
  }
