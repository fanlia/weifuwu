/**
 * MarkdownEditor — 分屏 Markdown 编辑器（textarea + 实时预览）
 *
 * 复用 Markdown 组件 parser（同一渲染——预览与最终展示零漂移）。
 * 受控纪律：value 受控 + 缺 onChange → warn（防静默不可用）。
 */
import type { Component } from '../../vdom/index.ts'
import { h } from '../../vdom/index.ts'
import { Markdown } from '../Markdown/Markdown.ts'

export interface MarkdownEditorProps {
  value: string
  onChange?: (value: string) => void
  placeholder?: string
  /** 初始模式：'write' | 'preview' | 'split'（默认 split） */
  mode?: 'write' | 'preview' | 'split'
  rows?: number
  disabled?: boolean
  className?: string
}

export const MarkdownEditor: Component<MarkdownEditorProps> = async (_init, ctx) => {
  let mode: 'write' | 'preview' | 'split' = 'split'
  return async (props) => {
    const { value, onChange, placeholder = '输入 Markdown…', rows = 12, disabled, className = '' } = props
    mode = props.mode ?? mode
    if (onChange === undefined && !disabled) {
      console.warn('[weifuwu] MarkdownEditor: 传入了受控 value 但缺少 onChange 回调——编辑将静默失效')
    }
    const onInput = (e: any) => { onChange?.((e.target as HTMLTextAreaElement).value) }
    const editor = h('textarea', {
      class: 'wf-md-editor-textarea wf-input',
      value,
      placeholder,
      rows,
      disabled,
      'data-wf-role': 'md-editor',
      onInput,
      onKeyDown: (e: KeyboardEvent) => { if (e.key === 'Tab') { e.preventDefault(); onChange?.(value + '  ') } },
      style: { fontFamily: 'var(--wf-font-mono)', fontSize: 13, lineHeight: 1.7, resize: 'vertical', minHeight: 80 },
    })
    const preview = h('div', { class: 'wf-md-editor-preview wf-surface wf-border wf-rounded-sm', style: { padding: '10px 14px', minHeight: 80, overflow: 'auto' } },
      value ? h(Markdown, { content: value }) : h('span', { class: 'wf-text-tertiary' }, '预览区（输入后实时渲染）'))
    return h('div', { class: `wf-md-editor wf-stack wf-gap-xs${className ? ` ${className}` : ''}` }, [
      h('div', { class: 'wf-row wf-gap-xs' }, [
        ['write', '编辑'], ['preview', '预览'], ['split', '分屏'],
      ].map(([k, label]) =>
        h('button', {
          key: k,
          type: 'button',
          class: `wf-btn wf-btn--sm${mode === k ? ' wf-btn--primary' : ''}`,
          onClick: () => { mode = k as any; ctx.render() },
        }, label))),
      mode === 'preview' ? preview
        : mode === 'write' ? editor
        : h('div', { class: 'wf-grid', style: '--wf-cols:1fr 1fr;--wf-gap:8px' }, [editor, preview]),
    ])
  }
}
