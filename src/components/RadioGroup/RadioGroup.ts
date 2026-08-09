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

export const RadioGroup: Component<RadioGroupProps> = (_init, ctx) =>
  (props) => {
  const { name, options = [], inline } = props

  // useControlled：受控/非受控统一（原实现非受控静默不可选——受控纪律违规）
  const ctrl = ctx?.ui?.useControlled<string>({ value: props.value, onChange: props.onChange, name: 'RadioGroup' })
  const select = (v: string) => {
    const wasControlled = ctrl?.controlled
    ctrl?.setValue(v)
    // onChange 通知语义（非受控也调）；受控时 setValue 已调
    if (!wasControlled) props.onChange?.(v)
  }

  const radios = options.map(opt => {
    const input = h('input', {
      type: 'radio',
      class: 'wf-radio-input',
      name: name ?? 'radio',
      value: opt.value,
      checked: ctrl?.value === opt.value || undefined,
      disabled: opt.disabled || undefined,
      onChange: () => select(opt.value),
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
