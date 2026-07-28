import type { Component } from '../../client/vnode.ts'
import type { WfuiContext } from '../../client/types.ts'
import { h } from '../../client/vnode.ts'

export type BadgeVariant = 'default' | 'primary' | 'success' | 'warning' | 'danger' | 'info'

export interface BadgeProps {
  variant?: BadgeVariant
  dot?: boolean
  children?: any
}

export const Badge: Component<BadgeProps> = (_init, _ctx) =>
  (props) => {
  const { variant = 'default', dot, children } = props

  if (dot) {
    return h('span', { class: `wf-badge-dot wf-badge-dot--${variant}` })
  }

  return h('span', { class: `wf-badge wf-badge--${variant}` }, children ?? '')
}
