import type { Component } from '../../client/vnode.ts'
import { h } from '../../client/vnode.ts'

export interface InputProps {
  label?: string
  name?: string
  type?: 'text' | 'email' | 'password' | 'number' | 'url' | 'date' | 'tel' | 'time' | 'color'
  value?: string
  placeholder?: string
  required?: boolean
  disabled?: boolean
  error?: string
  hint?: string
  /** 边框变体：borderless 用于可编辑标题/内联编辑（hover/focus 才显边框） */
  variant?: 'default' | 'borderless'
  onInput?: (e: Event) => void
  onChange?: (e: Event) => void
  /** 原生 input 属性透传（type=number 时 min/max/step 等） */
  min?: string | number
  max?: string | number
  step?: string | number
  [key: string]: any
}

export const Input: Component<InputProps> = (_init) =>
  (props) => {
  const { label, name, type = 'text', value, placeholder, required, disabled, error, hint, variant = 'default', onInput, onChange } = props

  const inputEl = h('input', {
    class: `wf-input${variant === 'borderless' ? ' wf-input--borderless' : ''}`,
    name: name || undefined,
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
