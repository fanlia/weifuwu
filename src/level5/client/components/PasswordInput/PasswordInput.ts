/** PasswordInput：密码输入：眼睛按钮切换可见性（showcase /components/passwordinput） */
/**
 * weifuwu/client/components — PasswordInput
 *
 * 密码输入：眼睛按钮切换可见性。Input 子集（label/error/hint/required/autoComplete 透传）。
 */

import type { Component } from '../../../../level6/client/vdom/index.ts'
import type { UIContext } from '../../../../level6/client/vdom/index.ts'
import { h } from '../../../../level6/client/vdom/index.ts'
import { Icon } from '../Icon/Icon.ts'

export interface PasswordInputProps {
  value?: string
  onInput?: (e: Event)=> void
  onChange?: (e: Event)=> void
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

export const PasswordInput: Component<PasswordInputProps> = (_init, ctx)=> {
  // 状态原语（set 自动重渲染）
  const show = ctx.ui.useSignal(false)

  return (props: PasswordInputProps)=> {
    const {
      value, onInput, onChange, label, name, placeholder,
      disabled, error, hint, required, autoComplete, className,
    } = props

    const toggle = ()=> {
      if (disabled) return
      show.set(v => !v)
    }

    // 字段契约（label/error/hint 结构 + aria——复用 Input 类面）
    const f = ctx.ui.useField({
      label, error, hint, required, name,
      labelClass: 'wf-input-label',
      errClass: 'wf-input-err',
      hintClass: 'wf-input-hint',
      reqClass: 'wf-input-req',
    })

    const input = h('input', {
      class: 'wf-input',
      type: show.get() ? 'text' : 'password',
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
      'aria-label': show.get() ? '隐藏密码' : '显示密码',
      tabIndex: -1,
      onClick: toggle,
    }, h(Icon, { name: show.get() ? 'eye-off' : 'eye', size: 16 }))

    const wrap = h('div', { class: 'wf-input-wrap wf-password' }, [input, eye])

    // 与 Textarea 同（恒包 wf-field——className 透传）
    return h('div', {
      class: `wf-field${f.stateClass}${className ? ` ${className}` : ''}`,
    }, [
      f.renderLabel(),
      wrap,
      f.renderError(),
      f.renderHint(),
    ].filter(Boolean))
  }
}
