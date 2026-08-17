/**
 * CodeEditor — 轻量代码编辑器（textarea + 行号——零依赖自研，不引 Monaco）
 *
 * 定位：配置/模板/脚本类轻编辑（非 IDE 级）——需要完整 IDE 体验的场景
 * 是裁剪边界（Monaco 600KB+ 违背零依赖哲学——design/components-cuts.md 登记）。
 * 受控纪律：value 受控 + 缺 onChange → warn。
 */
import type { Component } from '../../ui-dom/vnode.ts'
import { h } from '../../ui-dom/vnode.ts'

export interface CodeEditorProps {
  value: string
  onChange?: (value: string) => void
  lang?: 'ts' | 'tsx' | 'js' | 'css' | 'json' | 'md' | 'text'
  rows?: number
  readOnly?: boolean
  placeholder?: string
  className?: string
}

export const CodeEditor: Component<CodeEditorProps> = async (_init, ctx) => {
  return async (props) => {
    const { value, onChange, lang = 'text', rows = 10, readOnly, placeholder, className = '' } = props
    if (onChange === undefined && !readOnly) {
      console.warn('[weifuwu] CodeEditor: 传入了受控 value 但缺少 onChange 回调——编辑将静默失效')
    }
    const lineCount = value.split('\n').length
    const gutter = h('div', { class: 'wf-codeeditor-gutter', style: { fontFamily: 'var(--wf-font-mono)', fontSize: 12, lineHeight: 1.7, padding: '8px 0', textAlign: 'right', color: 'var(--wf-color-text-tertiary)', userSelect: 'none', overflow: 'hidden' } },
      Array.from({ length: lineCount }, (_, i) => h('div', { key: i, style: { paddingRight: 8 } }, String(i + 1))))
    const area = h('textarea', {
      class: 'wf-codeeditor-area',
      value, rows, placeholder, readOnly,
      'data-wf-role': 'code-editor',
      'data-lang': lang,
      spellcheck: false,
      style: { fontFamily: 'var(--wf-font-mono)', fontSize: 12, lineHeight: 1.7, padding: '8px 10px', border: 'none', outline: 'none', resize: 'vertical', flex: 1, minWidth: 0, background: 'transparent' },
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
    return h('div', { class: `wf-codeeditor wf-row wf-gap-none${className ? ` ${className}` : ''}`,
      style: { border: '1px solid var(--wf-color-border)', borderRadius: 'var(--wf-radius-sm)', overflow: 'hidden', background: 'var(--wf-color-bg)' } },
      [gutter, area])
  }
}
