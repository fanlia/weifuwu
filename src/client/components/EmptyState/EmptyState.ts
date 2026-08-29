import type { Component, VNode } from '../../vdom/index.ts'
import type { UIContext } from '../../vdom/index.ts'
import { h } from '../../vdom/index.ts'
import { Icon } from '../Icon/Icon.ts'

export interface EmptyStateProps {
  /** 图标——VNode（推荐 <Icon />）或字符串（emoji/字形）；默认 Icon inbox（P3：组件内禁裸 emoji） */
  icon?: string | VNode | null
  text?: string
  hint?: string
  children?: any
}

export const EmptyState: Component<EmptyStateProps> = (_init, _ctx) =>
  (props) => {
  const { icon = h(Icon, { name: 'inbox' }), text = '暂无数据', hint, children } = props

  const parts: any[] = [
    h('div', { class: 'wf-empty-icon' }, icon),
    h('div', { class: 'wf-empty-text' }, text),
  ]

  if (hint) parts.push(h('div', { class: 'wf-empty-hint' }, hint))
  if (children) parts.push(h('div', { class: 'wf-empty-action' }, children))

  return h('div', { class: 'wf-empty', role: 'status' }, parts)
}
