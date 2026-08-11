/**
 * weifuwu/components — PasswordInput
 *
 * 密码输入：眼睛按钮切换可见性。Input 子集（label/error/hint/required/autoComplete 透传）。
 */

import type { Component } from '../../ui-dom/vnode.ts'
import type { WfuiContext } from '../../ui-dom/types.ts'
import { h } from '../../ui-dom/vnode.ts'
import { Icon } from '../Icon/Icon.ts'

export interface PasswordInputProps {
  value?: string
  onInput?: (e: Event) => void
  onChange?: (e: Event) => void
  label?: string
  name?: string
  placeholder?: string
  disabled?: boolean
  error?: string
  hint?: string
  required?: boolean
  autoComplete?: string
  className?: string
}

export const PasswordInput: Component<PasswordInputProps> = async (_init, ctx) => {
  let show = false

  return async (props: PasswordInputProps) => {
    const {
      value, onInput, onChange, label, name, placeholder,
      disabled, error, hint, required, autoComplete, className,
    } = props

    const toggle = () => {
      if (disabled) return
      show = !show
      ctx.ui.render()
    }

    const labelEl = label
      ? h('label', { class: 'wf-input-label' }, [label, required ? h('span', { class: 'wf-input-req' }, '*') : null].filter(Boolean))
      : null

    const input = h('input', {
      class: 'wf-input',
      type: show ? 'text' : 'password',
      value,
      name,
      placeholder,
      disabled,
      autoComplete,
      onInput,
      onChange,
    })

    const eye = h('button', {
      class: 'wf-password-eye',
      type: 'button',
      'aria-label': show ? '隐藏密码' : '显示密码',
      tabIndex: -1,
      onClick: toggle,
    }, h(Icon, { name: show ? 'eye-off' : 'eye', size: 16 }))

    const wrap = h('div', { class: 'wf-input-wrap wf-password' }, [input, eye])

    const children: any[] = []
    if (labelEl) children.push(labelEl)
    children.push(wrap)
    if (error) children.push(h('div', { class: 'wf-input-err' }, error))
    if (hint && !error) children.push(h('div', { class: 'wf-input-hint' }, hint))

    return h('div', { class: `wf-field${className ? ` ${className}` : ''}` }, children)
  }
}
