import type { Component, VNode } from '../../ui-dom/vnode.ts'
import type { WfuiContext } from '../../ui-dom/types.ts'
import { h } from '../../ui-dom/vnode.ts'
import { Icon } from '../Icon/Icon.ts'

export interface StatCardProps {
  label: string
  /** 展示值——countdown 模式下可选（显示剩余时间） */
  value?: string | number
  trend?: 'up' | 'down'
  trendLabel?: string
  /** 图标——字符串（emoji/字形）或 VNode（推荐 <Icon name=... />，禁 emoji 装饰的场景用后者） */
  icon?: string | VNode | null
  /** 点击跳转/交互（悬停抬升 + role=button） */
  onClick?: () => void
  /** 数字从 0 递增动画（reduced-motion 下直接终值），仅数值类型生效 */
  animate?: boolean
  /** 倒计时目标时间戳（ms）——显示剩余 HH:MM:SS（antd Statistic.Countdown 等价） */
  countdown?: number
  /** 倒计时结束回调 */
  onFinish?: () => void
}

export const StatCard: Component<StatCardProps> = async (_init, ctx) => {
  // ── mount：数值动画经 ctx.ui.useTween（rAF + ease-out + reduced-motion 直落终值；
  // 幂等 reset——render 每帧调用安全，动画运行中同目标不重启）。
  // 偏好感知经 ctx.ui.useReducedMotion（JS 动画侧跳过，收敛手工 matchMedia）。
  let tween = ctx.ui.useTween(0, { duration: 400, ease: 'easeOutCubic' })

  // 倒计时：1s tick → render；卸载清理（setInterval 纪律）
  let countdownRemain = 0
  let timer: ReturnType<typeof setInterval> | null = null
  let latestOnFinish: (() => void) | undefined

  const stopTimer = () => {
    if (timer) { clearInterval(timer); timer = null }
  }

  return (props: StatCardProps) => {
    const { label, value, trend, trendLabel, icon, onClick, animate, countdown, onFinish } = props
    latestOnFinish = onFinish
    const target = typeof value === 'number' ? value : 0

    if (animate && typeof value === 'number') {
      tween.reset(target) // 幂等：同目标运行中不重启
    } else {
      ;(tween as any).value = target // 非动画/非数值：直落
    }

    // ── countdown 模式：目标时间戳 → 剩余秒数；启动/续 1s tick ──
    if (countdown !== undefined) {
      countdownRemain = Math.max(0, Math.ceil((countdown - Date.now()) / 1000))
      if (!timer) {
        timer = setInterval(() => {
          countdownRemain = Math.max(0, Math.ceil((countdown - Date.now()) / 1000))
          if (countdownRemain <= 0) {
            stopTimer()
            latestOnFinish?.()
          }
          ctx.ui.render()
        }, 1000)
      }
    } else if (timer) {
      stopTimer()
    }

  const display = countdown !== undefined
    ? (() => {
        const hh = Math.floor(countdownRemain / 3600)
        const mm = Math.floor((countdownRemain % 3600) / 60)
        const ss = countdownRemain % 60
        const pad = (n: number) => String(n).padStart(2, '0')
        return hh > 0 ? `${pad(hh)}:${pad(mm)}:${pad(ss)}` : `${pad(mm)}:${pad(ss)}`
      })()
    : (typeof value === 'number' ? String(tween.value) : String(value ?? ''))
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
