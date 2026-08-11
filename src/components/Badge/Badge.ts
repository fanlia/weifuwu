import type { Component } from '../../ui-dom/vnode.ts'
import type { WfuiContext } from '../../ui-dom/types.ts'
import { h } from '../../ui-dom/vnode.ts'

export type BadgeVariant = 'default' | 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'error'

export interface BadgeProps {
  variant?: BadgeVariant
  dot?: boolean
  children?: any
  /** 数值角标（与 children 互斥；超出 overflowCount 显示 N+） */
  count?: number
  /** 数值溢出阈值，默认 99（count > 阈值 → 阈值+） */
  overflowCount?: number
  /** count=0 时是否显示（默认 false 隐藏，antd showZero=false 语义） */
  showZero?: boolean
}

export const Badge: Component<BadgeProps> = async (_init, _ctx) =>
  async (props) => {
  const { variant = 'default', dot, children, count, overflowCount = 99, showZero = false } = props

  if (dot) {
    return h('span', { class: `wf-badge-dot wf-badge-dot--${variant}` })
  }

  // 数值角标（count 模式）
  if (count != null) {
    if (count === 0 && !showZero) return null
    const display = count > overflowCount ? `${overflowCount}+` : String(count)
    return h('span', {
      class: `wf-badge wf-badge--count wf-badge--${variant}`,
      'aria-label': `${count > overflowCount ? `超过 ${overflowCount}` : count} 条`,
    }, display)
  }

  return h('span', { class: `wf-badge wf-badge--${variant}` }, children ?? '')
}
