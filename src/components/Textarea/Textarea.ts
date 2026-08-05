import type { Component } from '../../client/vnode.ts'
import type { WfuiContext } from '../../client/types.ts'
import { h } from '../../client/vnode.ts'

export interface TextareaProps {
  label?: string
  value?: string
  placeholder?: string
  required?: boolean
  disabled?: boolean
  error?: string
  hint?: string
  rows?: number
  /** 最大字符数（同时限制输入） */
  maxLength?: number
  /** 显示字数统计（右下角；配合受控 value 实时更新） */
  showCount?: boolean
  onInput?: (e: Event) => void
}

export const Textarea: Component<TextareaProps> = (_init, _ctx) =>
  (props) => {
  const { label, value, placeholder, required, disabled, error, hint, rows = 3, maxLength, showCount, onInput } = props

  const textareaEl = h('textarea', {
    class: 'wf-textarea',
    value: value ?? '',
    placeholder,
    required: required || undefined,
    disabled: disabled || undefined,
    rows,
    maxLength,
    onInput,
  })

  const children: any[] = []

  if (label) {
    const labelContent: any[] = [label]
    if (required) labelContent.push(h('span', { class: 'wf-textarea-req' }, '*'))
    children.push(h('label', { class: 'wf-textarea-label' }, labelContent))
  }

  children.push(textareaEl)

  if (showCount) {
    const len = (value ?? '').length
    const over = maxLength != null && len > maxLength
    children.push(h('div', {
      class: `wf-textarea-count${over ? ' wf-textarea-count--over' : ''}`,
      'aria-live': 'polite',
    }, maxLength != null ? `${len}/${maxLength}` : String(len)))
  }

  if (error) children.push(h('div', { class: 'wf-textarea-err' }, error))
  if (hint && !error) children.push(h('div', { class: 'wf-textarea-hint' }, hint))

  return h('div', { class: `wf-textarea-wrap${error ? ' wf-textarea--err' : ''}` }, children)
}
