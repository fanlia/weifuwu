import type { Component, VNode } from '../../ui-dom/vnode.ts'
import type { WfuiContext } from '../../ui-dom/types.ts'
import { h } from '../../ui-dom/vnode.ts'
import { Icon } from '../Icon/Icon.ts'

export interface EmptyStateProps {
  /** 图标——VNode（推荐 <Icon />）或字符串（emoji/字形）；默认 Icon inbox（P3：组件内禁裸 emoji） */
  icon?: string | VNode | null
  text?: string
  hint?: string
  children?: any
}

export const EmptyState: Component<EmptyStateProps> = async (_init, _ctx) =>
  async (props) => {
  const { icon = h(Icon, { name: 'inbox' }), text = '暂无数据', hint, children } = props

  const parts: any[] = [
    h('div', { class: 'wf-empty-icon' }, icon),
    h('div', { class: 'wf-empty-text' }, text),
  ]

  if (hint) parts.push(h('div', { class: 'wf-empty-hint' }, hint))
  if (children) parts.push(h('div', { class: 'wf-empty-action' }, children))

  return h('div', { class: 'wf-empty', role: 'status' }, parts)
}
