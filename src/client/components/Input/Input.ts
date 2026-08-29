import type { Component } from '../../vdom/index.ts'
import { h } from '../../vdom/index.ts'

export interface InputProps {
  label?: string
  name?: string
  type?: 'text' | 'email' | 'password' | 'number' | 'url' | 'date' | 'tel' | 'time' | 'color'
  value?: string
  placeholder?: string
  required?: boolean
  disabled?: boolean
  /** 只读（不可编辑但可复制） */
  readonly?: boolean
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
  const { label, name, type = 'text', value, placeholder, required, disabled, readonly, error, hint, variant = 'default', onInput, onChange, ...rest } = props

  const inputEl = h('input', {
    class: `wf-input${variant === 'borderless' ? ' wf-input--borderless' : ''}`,
    name: name || undefined,
    type,
    value: value ?? '',
    placeholder,
    required: required || undefined,
    disabled: disabled || undefined,
    readonly: readonly || undefined,
    onInput,
    onChange,
    // 额外原生 props 透传（onKeyDown/maxLength/autocomplete 等——调用方传即达，不吞）
    ...rest,
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
