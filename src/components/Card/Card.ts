import type { Component } from '../../client/vnode.ts'
import type { WfuiContext } from '../../client/types.ts'
import { h } from '../../client/vnode.ts'

export interface CardProps {
  variant?: 'default' | 'outlined'
  padding?: 'sm' | 'md' | 'lg'
  clickable?: boolean
  /** hover 抬升（阴影 + 上移），适合可点击/可悬停的卡片 */
  hover?: boolean
  /** 选中态（边框高亮 + 品牌浅底），适合选择卡片 */
  active?: boolean
  onClick?: () => void
  children?: any
}

export const Card: Component<CardProps> = (_init, _ctx) =>
  (props) => {
  const { variant = 'default', padding = 'md', clickable, hover, active, onClick, children } = props

  const cls = [
    'wf-card',
    `wf-card--${variant}`,
    `wf-card--pad-${padding}`,
    clickable && 'wf-card--clickable',
    hover && 'wf-card--hover',
    active && 'wf-card--active',
  ].filter(Boolean).join(' ')

  return h('div', { class: cls, onClick, role: clickable ? 'button' : undefined, tabindex: clickable ? 0 : undefined }, children)
}
