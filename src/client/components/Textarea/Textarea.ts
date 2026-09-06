/** Textarea：多行文本，支持 rows/label/error/hint（showcase /components/textarea） */
/**
 * weifuwu/client/components — Textarea
 *
 * 2027-09 原语全面化 W2：label/required/error/hint 块 + aria 连接 → useField
 * 契约——组件只写输入面（textarea + showCount 业务）。
 */

import type { Component } from '../../vdom/index.ts'
import { h } from '../../vdom/index.ts'

export interface TextareaProps {
  label?: string
  value?: string
  placeholder?: string
  required?: boolean
  disabled?: boolean
  error?: string
  hint?: string
  rows?: number
  /** 最大字符数（同时限制输入） */
  maxLength?: number
  /** 显示字数统计（右下角；配合受控 value 实时更新） */
  showCount?: boolean
  onInput?: (e: Event)=> void
}

export const Textarea: Component<TextareaProps> = (_init, ctx)=>
  (props)=> {
  const { label, value, placeholder, required, disabled, error, hint, rows = 3, maxLength, showCount, onInput } = props
  // 字段契约（label/error/hint 结构 + aria 连接——单源）
  const f = ctx.ui.useField({
    label, error, hint, required,
    labelClass: 'wf-textarea-label',
    errClass: 'wf-textarea-err',
    hintClass: 'wf-textarea-hint',
    reqClass: 'wf-textarea-req',
    wrapErrClass: 'wf-textarea--err',
  })

  const textareaEl = h('textarea', {
    class: 'wf-textarea',
    // 非受控保持 undefined（2027-09——同 Input——diff 过滤避免清写）
    value: value,
    placeholder,
    required: required || undefined,
    disabled: disabled || undefined,
    rows,
    maxLength,
    onInput,
    ...f.inputProps(),
  })

  // **恒 wrap（与原逻辑等价——Textarea 无 label/error/hint 也包 div——
  // 与 Input 的裸输入短路不同——CSS 依赖 wf-textarea-wrap）**
  const children: any[] = [f.renderLabel(), textareaEl]

  if (showCount) {
    const len = (value ?? '').length
    const over = maxLength != null && len > maxLength
    children.push(h('div', {
      class: `wf-textarea-count${over ? ' wf-textarea-count--over' : ''}`,
      'aria-live': 'polite',
    }, maxLength != null ? `${len}/${maxLength}` : String(len)))
  }

  children.push(f.renderError())
  children.push(f.renderHint())

  return h('div', { class: `wf-textarea-wrap${f.stateClass}` }, children.filter(Boolean))
}
