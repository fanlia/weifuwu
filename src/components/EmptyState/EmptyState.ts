import type { Component } from '../../client/vnode.ts'
import type { WfuiContext } from '../../client/types.ts'
import { h } from '../../client/vnode.ts'

export interface EmptyStateProps {
  icon?: string
  text?: string
  hint?: string
  children?: any
}

export const EmptyState: Component<EmptyStateProps> = (_init, _ctx) =>
  (props) => {
  const { icon = '📦', text = '暂无数据', hint, children } = props

  const parts: any[] = [
    h('div', { class: 'wf-empty-icon' }, icon),
    h('div', { class: 'wf-empty-text' }, text),
  ]

  if (hint) parts.push(h('div', { class: 'wf-empty-hint' }, hint))
  if (children) parts.push(h('div', { class: 'wf-empty-action' }, children))

  return h('div', { class: 'wf-empty', role: 'status' }, parts)
}
