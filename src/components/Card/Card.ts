import type { Component } from '../../client/vnode.ts'
import type { WfuiContext } from '../../client/types.ts'
import { h } from '../../client/vnode.ts'

export interface CardProps {
  variant?: 'default' | 'outlined'
  padding?: 'sm' | 'md' | 'lg'
  clickable?: boolean
  onClick?: () => void
  children?: any
}

export const Card: Component<CardProps> = (_init, _ctx) =>
  (props) => {
  const { variant = 'default', padding = 'md', clickable, onClick, children } = props

  const cls = [
    'wf-card',
    `wf-card--${variant}`,
    `wf-card--pad-${padding}`,
    clickable && 'wf-card--clickable',
  ].filter(Boolean).join(' ')

  return h('div', { class: cls, onClick, role: clickable ? 'button' : undefined, tabindex: clickable ? 0 : undefined }, children)
}
