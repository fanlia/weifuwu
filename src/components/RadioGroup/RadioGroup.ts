import type { Component } from '../../client/vnode.ts'
import type { WfuiContext } from '../../client/types.ts'
import { h } from '../../client/vnode.ts'

export interface RadioOption {
  value: string
  label: string
  disabled?: boolean
}

export interface RadioGroupProps {
  name?: string
  value?: string
  options?: RadioOption[]
  inline?: boolean
  onChange?: (value: string) => void
}

export const RadioGroup: Component<RadioGroupProps> = (_init, _ctx) =>
  (props) => {
  const { name, value, options = [], inline, onChange } = props

  const radios = options.map(opt => {
    const input = h('input', {
      type: 'radio',
      class: 'wf-radio-input',
      name: name ?? 'radio',
      value: opt.value,
      checked: value === opt.value || undefined,
      disabled: opt.disabled || undefined,
      onChange: onChange ? () => onChange(opt.value) : undefined,
    })

    const visual = h('span', { class: 'wf-radio-visual' })
    const label = h('span', { class: 'wf-radio-label-text' }, opt.label)

    return h('label', {
      class: 'wf-radio',
      key: opt.value,
    }, [input, visual, label])
  })

  return h('div', {
    class: `wf-radio-group${inline ? ' wf-radio-group--inline' : ''}`,
  }, radios)
}
