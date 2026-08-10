import type { Component } from '../../ui-dom/vnode.ts'
import type { WfuiContext } from '../../ui-dom/types.ts'
import { h } from '../../ui-dom/vnode.ts'

export interface FieldProps {
  label?: string
  required?: boolean
  error?: string
  hint?: string
  children?: any
}

export const Field: Component<FieldProps> = (_init, _ctx) =>
  (props) => {
  const { label, required, error, hint, children } = props

  const parts: any[] = []

  if (label) {
    const labelContent: any[] = [label]
    if (required) labelContent.push(h('span', { class: 'wf-field-req' }, '*'))
    parts.push(h('label', { class: 'wf-field-label' }, labelContent))
  }

  parts.push(children)

  if (error) parts.push(h('div', { class: 'wf-field-err' }, error))
  if (hint && !error) parts.push(h('div', { class: 'wf-field-hint' }, hint))

  return h('div', { class: `wf-field${error ? ' wf-field--err' : ''}` }, parts)
}
