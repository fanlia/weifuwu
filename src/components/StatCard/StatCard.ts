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
  // ── mount：数字动画状态（rAF 400ms ease-out；reduced-motion 直落） ──
  let shown = 0
  let rafId: number | undefined

  return (props: StatCardProps) => {
    const { label, value, trend, trendLabel, icon, onClick, animate } = props
    const target = typeof value === 'number' ? value : 0

    if (animate && typeof value === 'number') {
      const reduce = typeof matchMedia !== 'undefined'
        && matchMedia('(prefers-reduced-motion: reduce)').matches
      if (reduce || shown === target) {
        shown = target
      } else {
        const start = shown
        const dur = 400
        const t0 = performance.now()
        if (rafId) cancelAnimationFrame(rafId)
        const step = (t: number) => {
          const p = Math.min(1, (t - t0) / dur)
          const eased = 1 - Math.pow(1 - p, 3)
          shown = Math.round(start + (target - start) * eased)
          if (p < 1) {
            rafId = requestAnimationFrame(step)
            ctx.ui.render()
          } else {
            rafId = undefined
            ctx.ui.render()
          }
        }
        rafId = requestAnimationFrame(step)
      }
    } else {
      shown = target
    }

  const display = typeof value === 'number' ? String(shown) : String(value)
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
