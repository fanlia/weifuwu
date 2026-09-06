/** Field：label+error+hint 容器（showcase /components/field） */
import type {Component, VNodeChild} from '../../vdom/index.ts'
import type { UIContext } from '../../vdom/index.ts'
import { h } from '../../vdom/index.ts'

export interface FieldProps {
  label?: string
  required?: boolean
  error?: string
  hint?: string
  children?: VNodeChild}

export const Field: Component<FieldProps> = (_init, ctx)=>
  (props)=> {
  const { label, required, error, hint, children } = props
  // 字段契约（useField 的声明式形态——容器组件：children 由调用方渲染）
  const f = ctx.ui.useField({
    label, error, hint,
    // 原语义：required 星嵌在 label 内——无 label 无星（与 renderLabel 的
    // 独立星语义对齐：仅在 label 存在时传 required）
    required: label ? required : false,
    labelClass: 'wf-field-label',
    errClass: 'wf-field-err',
    hintClass: 'wf-field-hint',
    reqClass: 'wf-field-req',
    wrapErrClass: 'wf-field--err',
  })

  return h('div', { class: `wf-field${f.stateClass}` }, [
    f.renderLabel(),
    children,
    f.renderError(),
    f.renderHint(),
  ].filter(Boolean))
}
