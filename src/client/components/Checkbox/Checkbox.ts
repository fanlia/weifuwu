import type { Component } from '../../vdom/index.ts'
import type { UIContext } from '../../vdom/index.ts'
import { h } from '../../vdom/index.ts'

export interface CheckboxProps {
  label?: string
  checked?: boolean
  disabled?: boolean
  onChange?: (checked: boolean) => void
}

export const Checkbox: Component<CheckboxProps> = (_init, _ctx) =>
  (props) => {
  const { label, checked, disabled, onChange } = props

  const input = h('input', {
    type: 'checkbox',
    class: 'wf-checkbox-input',
    checked: checked || undefined,
    disabled: disabled || undefined,
    onChange: onChange ? (e: Event) => onChange((e.target as HTMLInputElement).checked) : undefined,
  })

  const visual = h('span', { class: 'wf-checkbox-visual' })

  if (!label) return h('label', { class: 'wf-checkbox' }, [input, visual])

  return h('label', { class: 'wf-checkbox' }, [
    input,
    visual,
    h('span', { class: 'wf-checkbox-label' }, label),
  ])
}
