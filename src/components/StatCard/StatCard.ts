import type { Component } from '../../client/vnode.ts'
import type { WfuiContext } from '../../client/types.ts'
import { h } from '../../client/vnode.ts'

export interface StatCardProps {
  label: string
  value: string | number
  trend?: 'up' | 'down'
  trendLabel?: string
  icon?: string
  /** 点击跳转/交互（悬停抬升 + role=button） */
  onClick?: () => void
}

export const StatCard: Component<StatCardProps> = (_init, _ctx) =>
  (props) => {
  const { label, value, trend, trendLabel, icon, onClick } = props

  const children: any[] = []

  if (icon) children.push(h('div', { class: 'wf-stat-icon' }, icon))

  children.push(h('div', { class: 'wf-stat-value' }, String(value)))
  children.push(h('div', { class: 'wf-stat-label' }, label))

  if (trend) {
    children.push(h('div', {
      class: `wf-stat-trend wf-stat-trend--${trend}`,
    }, [
      h('span', { class: 'wf-stat-trend-arrow' }, trend === 'up' ? '↑' : '↓'),
      trendLabel ? h('span', { class: 'wf-stat-trend-label' }, trendLabel) : null,
    ].filter(Boolean)))
  }

  return h('div', {
    class: `wf-stat${onClick ? ' wf-stat--clickable' : ''}`,
    onClick,
    role: onClick ? 'button' : undefined,
    tabindex: onClick ? 0 : undefined,
  }, children)
}
