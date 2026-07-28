import type { Component } from '../../client/vnode.ts'
import type { WfuiContext } from '../../client/types.ts'
import { h, Fragment } from '../../client/vnode.ts'

export interface SelectOption {
  value: string
  label: string
  disabled?: boolean
}

export interface SelectProps {
  label?: string
  value?: string
  options?: SelectOption[]
  placeholder?: string
  required?: boolean
  disabled?: boolean
  error?: string
  onChange?: (e: Event) => void
  children?: any
}

export const Select: Component<SelectProps> = (_init, _ctx) =>
  (props) => {
  const { label, value, options, placeholder, required, disabled, error, onChange, children } = props

  const optionEls: any[] = []
  if (placeholder) {
    optionEls.push(h('option', { value: '', disabled: true }, placeholder))
  }
  if (options) {
    for (const opt of options) {
      optionEls.push(h('option', { value: opt.value, disabled: opt.disabled }, opt.label))
    }
  }

  const selectEl = h('select', {
    class: 'wf-select',
    value: value ?? '',
    required: required || undefined,
    disabled: disabled || undefined,
    onChange,
  }, children ?? optionEls)

  const wrapChildren: any[] = []

  if (label) {
    const labelContent: any[] = [label]
    if (required) labelContent.push(h('span', { class: 'wf-select-req' }, '*'))
    wrapChildren.push(h('label', { class: 'wf-select-label' }, labelContent))
  }

  wrapChildren.push(selectEl)

  if (error) wrapChildren.push(h('div', { class: 'wf-select-err' }, error))

  return h('div', { class: `wf-select-wrap${error ? ' wf-select--err' : ''}` }, wrapChildren)
}
