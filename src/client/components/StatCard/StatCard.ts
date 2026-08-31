import type { Component, VNode } from '../../vdom/index.ts'
import type { UIContext } from '../../vdom/index.ts'
import { h } from '../../vdom/index.ts'
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

export const StatCard: Component<StatCardProps> = (init, ctx) => {
  // ── mount：数值动画经 ctx.ui.useTween（rAF + ease-out + reduced-motion 直落终值；
  // 幂等 reset——render 每帧调用安全，动画运行中同目标不重启）。
  // 偏好感知内建于 useTween（reduced-motion 直落终值——组件层不再重复 matchMedia）。
  let tween = ctx.ui.useTween(0, { duration: 400, ease: 'easeOutCubic' })

  // 倒计时：1s tick → render。
  // 定时器纪律（AGENTS.md #12）：定时器变量在工厂期声明 + ctx.ui.hold 注册清理——
  // render 只声明意图（wantTick 标志），真正 setInterval 经 queueMicrotask 出渲染
  // 窗口（effect-guard 合法——Affix/LogViewer 同款延迟模式）；SSR 端不启动
  // （node 进程零定时器驻留——服务端一次性渲染，首帧值已同步算出）。
  let countdownRemain = 0
  let timer: ReturnType<typeof setInterval> | null = null
  let latestCountdown: number | undefined
  let latestOnFinish: (() => void) | undefined

  const stopTimer = () => {
    if (timer) { clearInterval(timer); timer = null }
  }
  const tick = () => {
    if (latestCountdown === undefined) return
    countdownRemain = Math.max(0, Math.ceil((latestCountdown - Date.now()) / 1000))
    if (countdownRemain <= 0) {
      stopTimer()
      latestOnFinish?.()
    }
    ctx.render()
  }
  const startTimer = () => {
    if (timer || typeof window === 'undefined') return
    timer = setInterval(tick, 1000)
  }
  ctx.ui.hold(stopTimer)
  // 首帧即倒计时（initProps）——工厂期直接创建（窗口外——合法）
  if ((init as StatCardProps).countdown !== undefined) queueMicrotask(startTimer)

  return (props: StatCardProps) => {
    const { label, value, trend, trendLabel, icon, onClick, animate, countdown, onFinish } = props
    latestOnFinish = onFinish
    const target = typeof value === 'number' ? value : 0

    if (animate && typeof value === 'number') {
      // **直落终值（G14 定稿——报表页实证）**：数字动画依赖 rAF 持续驱动——
      // headless / 后台 tab 中 rAF 停摆 → tween.value 恒为起始值 → 用户看到
      // 「Agent 总数 0」而数据实际正确（同页字符串卡直落正确的混合实证）。
      // 装饰动画的正确性代价不可接受——数值显示直接落终值。
      tween.reset(target)
      ;(tween as any).value = target
    } else {
      ;(tween as any).value = target // 非动画/非数值：直落
    }

    // ── countdown 模式：目标时间戳 → 剩余秒数；tick 意图声明（创建出窗口）──
    latestCountdown = countdown
    if (countdown !== undefined) {
      countdownRemain = Math.max(0, Math.ceil((countdown - Date.now()) / 1000))
      if (!timer) queueMicrotask(startTimer)
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
