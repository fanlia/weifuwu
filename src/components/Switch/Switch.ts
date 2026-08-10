import type { Component } from '../../ui-dom/vnode.ts'
import type { WfuiContext } from '../../ui-dom/types.ts'
import { h } from '../../ui-dom/vnode.ts'

export interface SwitchProps {
  label?: string
  checked?: boolean
  disabled?: boolean
  onChange?: (checked: boolean) => void
}

export const Switch: Component<SwitchProps> = (_init, ctx) =>
  (props) => {
  const { label, checked, disabled, onChange } = props

  const input = h('input', {
    type: 'checkbox',
    class: 'wf-switch-input',
    checked: checked || undefined,
    disabled: disabled || undefined,
    role: 'switch',
    'aria-checked': String(!!checked),
    onChange: onChange ? (e: Event) => onChange((e.target as HTMLInputElement).checked) : undefined,
  })

  const track = h('span', { class: 'wf-switch-track' })

  const SL = (ctx as any)?.i18n?.components?.Switch ?? {}
  if (!label) return h('label', { class: 'wf-switch', 'aria-label': SL.ariaLabel ?? '切换' }, [input, track])

  return h('label', { class: 'wf-switch' }, [
    input,
    track,
    h('span', { class: 'wf-switch-label' }, label),
  ])

  }
