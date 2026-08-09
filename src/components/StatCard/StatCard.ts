import type { Component } from '../../client/vnode.ts'
import type { WfuiContext } from '../../client/types.ts'
import { h } from '../../client/vnode.ts'
import { Icon } from '../Icon/Icon.ts'

export interface StatCardProps {
  label: string
  value: string | number
  trend?: 'up' | 'down'
  trendLabel?: string
  icon?: string
  /** 点击跳转/交互（悬停抬升 + role=button） */
  onClick?: () => void
  /** 数字从 0 递增动画（reduced-motion 下直接终值），仅数值类型生效 */
  animate?: boolean
}

export const StatCard: Component<StatCardProps> = (_init, ctx) => {
  // ── mount：数值动画经 ctx.ui.useTween（rAF + ease-out + reduced-motion 直落终值；
  // 幂等 reset——render 每帧调用安全，动画运行中同目标不重启）。
  // 偏好感知经 ctx.ui.useReducedMotion（JS 动画侧跳过，收敛手工 matchMedia）。
  let tween = ctx.ui.useTween(0, { duration: 400, ease: 'easeOutCubic' })

  return (props: StatCardProps) => {
    const { label, value, trend, trendLabel, icon, onClick, animate } = props
    const target = typeof value === 'number' ? value : 0

    if (animate && typeof value === 'number') {
      tween.reset(target) // 幂等：同目标运行中不重启
    } else {
      ;(tween as any).value = target // 非动画/非数值：直落
    }

  const display = typeof value === 'number' ? String(tween.value) : String(value)
  const children: any[] = []

  if (icon) children.push(h('div', { class: 'wf-stat-icon' }, icon))

  children.push(h('div', { class: 'wf-stat-value wf-nums' }, display))
  children.push(h('div', { class: 'wf-stat-label' }, label))

  if (trend) {
    children.push(h('div', {
      class: `wf-stat-trend wf-stat-trend--${trend}`,
    }, [
      h('span', { class: 'wf-stat-trend-arrow' }, h(Icon, { name: trend === 'up' ? 'arrow-up' : 'arrow-down' })),
      trendLabel ? h('span', { class: 'wf-stat-trend-label' }, trendLabel) : null,
    ].filter(Boolean)))
  }

  return h('div', {
    class: `wf-stat${onClick ? ' wf-stat--clickable' : ''}${onClick ? ' wf-elevate' : ''}`,
    onClick,
    role: onClick ? 'button' : undefined,
    tabindex: onClick ? 0 : undefined,
    // 可点击指标卡：role=button，Enter/Space 必须可操作（键盘可达红线）
    onKeyDown: onClick
      ? (e: KeyboardEvent) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onClick()
          }
        }
      : undefined,
  }, children)
  }
}
