import type { Component } from '../../client/vnode.ts'
import { h } from '../../client/vnode.ts'

export interface InputProps {
  label?: string
  type?: 'text' | 'email' | 'password' | 'number' | 'url' | 'date' | 'tel' | 'time'
  value?: string
  placeholder?: string
  required?: boolean
  disabled?: boolean
  error?: string
  hint?: string
  onInput?: (e: Event) => void
  onChange?: (e: Event) => void
}

export const Input: Component<InputProps> = (props) => {
  const { label, type = 'text', value, placeholder, required, disabled, error, hint, onInput, onChange } = props

  const inputEl = h('input', {
    class: 'wf-input',
    type,
    value: value ?? '',
    placeholder,
    required: required || undefined,
    disabled: disabled || undefined,
    onInput,
    onChange,
  })

  if (!label && !error && !hint) return inputEl

  const children: any[] = []

  if (label) {
    const labelContent: any[] = [label]
    if (required) labelContent.push(h('span', { class: 'wf-input-req' }, '*'))
    children.push(h('label', { class: 'wf-input-label' }, labelContent))
  }

  children.push(inputEl)

  if (error) children.push(h('div', { class: 'wf-input-err' }, error))
  if (hint && !error) children.push(h('div', { class: 'wf-input-hint' }, hint))

  return h('div', { class: `wf-input-wrap${error ? ' wf-input--err' : ''}` }, children)
}
