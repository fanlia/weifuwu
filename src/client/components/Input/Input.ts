/** Input：text/email/password/number，支持 label/error/hint/required（showcase /components/input） */
/**
 * weifuwu/client/components — Input
 *
 * 2027-09 W5：label/required/error/hint 块 + aria 连接（aria-invalid/
 * aria-describedby/aria-required/label for）→ useField 契约——组件只写输入面。
 */

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
  onInput?: (e: Event)=> void
  onChange?: (e: Event)=> void
  /** 原生 input 属性透传（type=number 时 min/max/step 等） */
  min?: string | number
  max?: string | number
  step?: string | number
  [key: string]: any
}

export const Input: Component<InputProps> = (_init, ctx)=>
  (props)=> {
  const { label, name, type = 'text', value, placeholder, required, disabled, readonly, error, hint, variant = 'default', onInput, onChange, ...rest } = props
  // 字段契约（label/error/hint 结构 + aria 连接——单源）
  const f = ctx.ui.useField({
    label, error, hint, required, name,
    labelClass: 'wf-input-label',
    errClass: 'wf-input-err',
    hintClass: 'wf-input-hint',
    reqClass: 'wf-input-req',
    wrapErrClass: 'wf-input--err',
  })

  const inputEl = h('input', {
    class: `wf-input${variant === 'borderless' ? ' wf-input--borderless' : ''}`,
    name: name || undefined,
    type,
    // **非受控 value 保持 undefined（2027-09——value 键脱节修复配套）**：
    // diff 对表单控件 value 总是发——非受控（undefined）若规范成 ''——
    // 每次渲染都发 '' → patch 现值比较（DOM=用户输入）→ 写 '' → 输入被清
    // （deep-input 场景 8s 超时实证）——undefined 由 serializableAttrs
    // 过滤（不进总是发判定）——受控场景正常发
    value: value,
    placeholder,
    required: required || undefined,
    disabled: disabled || undefined,
    readonly: readonly || undefined,
    onInput,
    onChange,
    // aria 连接面（契约——id/aria-invalid/aria-describedby/aria-required）
    ...f.inputProps(),
    // 额外原生 props 透传（onKeyDown/maxLength/autocomplete 等——调用方传即达，不吞）
    ...rest,
  })

  if (!f.hasWrap) return inputEl

  return h('div', { class: `wf-input-wrap${f.stateClass}` }, [
    f.renderLabel(),
    inputEl,
    f.renderError(),
    f.renderHint(),
  ])
  }
