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
  onInput?: (e: Event) => void
}

export const Textarea: Component<TextareaProps> = (_init, _ctx) =>
  (props) => {
  const { label, value, placeholder, required, disabled, error, hint, rows = 3, onInput } = props

  const textareaEl = h('textarea', {
    class: 'wf-textarea',
    value: value ?? '',
    placeholder,
    required: required || undefined,
    disabled: disabled || undefined,
    rows,
    onInput,
  })

  const children: any[] = []

  if (label) {
    const labelContent: any[] = [label]
    if (required) labelContent.push(h('span', { class: 'wf-textarea-req' }, '*'))
    children.push(h('label', { class: 'wf-textarea-label' }, labelContent))
  }

  children.push(textareaEl)

  if (error) children.push(h('div', { class: 'wf-textarea-err' }, error))
  if (hint && !error) children.push(h('div', { class: 'wf-textarea-hint' }, hint))

  return h('div', { class: `wf-textarea-wrap${error ? ' wf-textarea--err' : ''}` }, children)
}
