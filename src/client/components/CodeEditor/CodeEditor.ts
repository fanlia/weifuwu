/**
 * CodeEditor — 轻量代码编辑器（textarea + 行号——零依赖自研，不引 Monaco）
 *
 * 定位：配置/模板/脚本类轻编辑（非 IDE 级）——需要完整 IDE 体验的场景
 * 是裁剪边界（Monaco 600KB+ 违背零依赖哲学——docs/client.md 登记）。
 * 受控纪律：value 受控 + 缺 onChange → warn。
 */
import type { Component } from '../../vdom/index.ts'
import { h } from '../../vdom/index.ts'
import { tokenize } from '../CodeBlock/highlight.ts' // 语法高亮复用（共享 tokenizer——CodeBlock 同源）

export interface CodeEditorProps {
  value: string
  onChange?: (value: string) => void
  lang?: 'ts' | 'tsx' | 'js' | 'css' | 'json' | 'md' | 'text'
  rows?: number
  readOnly?: boolean
  placeholder?: string
  className?: string
}

export const CodeEditor: Component<CodeEditorProps> = (_init, ctx) => {
  const render = (props: CodeEditorProps) => {
    const { value, onChange, lang = 'text', rows = 10, readOnly, placeholder, className = '' } = props
    if (onChange === undefined && !readOnly) {
      console.warn('[weifuwu] CodeEditor: 传入了受控 value 但缺少 onChange 回调——编辑将静默失效')
    }
    const lineCount = value.split('\n').length
    const gutter = h('div', { class: 'wf-codeeditor-gutter', style: { fontFamily: 'var(--wf-font-mono)', fontSize: 12, lineHeight: 1.7, padding: '8px 0', textAlign: 'right', color: 'var(--wf-color-text-tertiary)', userSelect: 'none', overflow: 'hidden' } },
      Array.from({ length: lineCount }, (_, i) => h('div', { key: i, style: { paddingRight: 8 } }, String(i + 1))))
    // 语法高亮：tokenizer（CodeBlock 同源）——双层 overlay（text 类/无 lang 保持纯文本）
    const hlTokens = lang !== 'text' ? tokenize(value, lang) : null
    const hl = h('pre', {
      class: 'wf-codeeditor-hl',
      'aria-hidden': true,
      style: {
        position: 'absolute', inset: 0, margin: 0, pointerEvents: 'none',
        fontFamily: 'var(--wf-font-mono)', fontSize: 12, lineHeight: 1.7,
        padding: '8px 10px', whiteSpace: 'pre', overflow: 'hidden',
        color: 'var(--wf-color-text)', background: 'transparent', border: 'none',
      },
    }, hlTokens ? hlTokens.map((t, i) => (t.type === 'text' ? t.text : h('span', { key: i, class: `wf-hl-${t.type}` }, t.text))) : value)
    const area = h('textarea', {
      class: 'wf-codeeditor-area',
      value, rows, placeholder, readOnly,
      'data-wf-role': 'code-editor',
      'data-lang': lang,
      spellcheck: false,
      wrap: 'off', // 水平滚动——pre 同 whiteSpace: pre 对齐
      style: { fontFamily: 'var(--wf-font-mono)', fontSize: 12, lineHeight: 1.7, padding: '8px 10px', border: 'none', outline: 'none', resize: 'vertical', display: 'block', width: '100%', background: 'transparent', overflow: 'auto', color: 'transparent', caretColor: 'var(--wf-color-text)' },
      onScroll: (e: any) => { const el = e.target as HTMLElement; (hl as any).scrollTop = el.scrollTop; (hl as any).scrollLeft = el.scrollLeft },
      onInput: (e: any) => { onChange?.((e.target as HTMLTextAreaElement).value) },
      onKeyDown: (e: KeyboardEvent) => {
        // Tab 插入两个空格（编辑器惯例）
        if (e.key === 'Tab') {
          e.preventDefault()
          const ta = e.target as HTMLTextAreaElement
          const s = ta.selectionStart ?? value.length
          onChange?.(value.slice(0, s) + '  ' + value.slice(s))
        }
      },
    })
    return h('div', { class: `wf-codeeditor wf-row wf-gap-none wf-items-start${className ? ` ${className}` : ''}`,
      style: { border: '1px solid var(--wf-color-border)', borderRadius: 'var(--wf-radius-sm)', overflow: 'hidden', background: 'var(--wf-color-bg)' } },
      [gutter,
        h('div', { class: 'wf-codeeditor-body', style: { position: 'relative', flex: 1, minWidth: 0 } },
          [hl, area])])
  }
  // **memo（opt-in shouldRender）**：value/lang/rows/readOnly 比较——onChange
  // 闭包引用豁免（回调变化不触发重渲染——高频输入下编辑器段零扰动）
  render.shouldRender = (prev: any, next: any) =>
    (prev as CodeEditorProps).value !== (next as CodeEditorProps).value ||
    (prev as CodeEditorProps).lang !== (next as CodeEditorProps).lang ||
    (prev as CodeEditorProps).rows !== (next as CodeEditorProps).rows ||
    (prev as CodeEditorProps).readOnly !== (next as CodeEditorProps).readOnly
  return render
}
